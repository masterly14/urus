import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { JobRecord, EnqueueJobInput } from "@/lib/job-queue/types";
import { normalizePhones } from "@/lib/market";
import {
  MarketWorkerClient,
} from "@/lib/workers/contracts/market-worker-client";
import { MarketWorkerError } from "@/lib/workers/contracts/market-worker";
import type { HandlerResult } from "@/lib/workers/consumer/types";

interface FetchDetailPayload {
  listingId?: string;
}

function readWorkerClient(): MarketWorkerClient | null {
  const baseUrl = process.env.MARKET_WORKER_BASE_URL?.trim();
  const secret = process.env.MARKET_WORKER_SHARED_SECRET?.trim();
  // Default 60s: detalle interactivo (click "Ver telefono") suele tardar
  // 30-45s + margen por warm-session/proxy. Override con
  // MARKET_WORKER_REQUEST_TIMEOUT_MS cuando haga falta.
  const requestTimeoutMs = Number(process.env.MARKET_WORKER_REQUEST_TIMEOUT_MS ?? 60_000);
  if (!baseUrl || !secret) return null;
  return new MarketWorkerClient({
    baseUrl,
    secret,
    requestTimeoutMs: Math.max(1_000, requestTimeoutMs),
  });
}

function mergePhones(current: string[], incoming: string[]): string[] {
  const set = new Set<string>();
  for (const p of normalizePhones(current)) set.add(p);
  for (const p of normalizePhones(incoming)) set.add(p);
  return [...set];
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    if (typeof raw !== "string") continue;
    const cleaned = raw.trim();
    if (!cleaned) continue;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
}

const MAX_DETAIL_FETCH_ATTEMPTS = 3;

/**
 * Maneja `MARKET_FETCH_DETAIL`. Politica nueva (mayo 2026):
 *
 *  - Aplica a todos los portales (Idealista, Fotocasa, Pisos.com) y a
 *    todos los `advertiserType` (particular Y agency). El worker hace
 *    click "Ver telefono" en la ficha y extrae phones + descripcion +
 *    fotos + listingReference + cadastralRef.
 *  - Skip cuando la ficha ya esta completa (phones>0 y description>0
 *    y imageUrls>0) — evita reprocesar.
 *  - Skip cuando ya se intento `MAX_DETAIL_FETCH_ATTEMPTS` veces. Marca
 *    `captacionLastError = phone_unavailable` cuando agota intentos sin
 *    teléfono.
 *  - Cada intento incrementa `detailFetchAttempts` y setea `detailFetchedAt`.
 */
export async function handleMarketFetchDetail(job: JobRecord): Promise<HandlerResult> {
  const payload = (job.payload ?? {}) as FetchDetailPayload;
  if (!payload.listingId) {
    return {
      success: false,
      error: "MARKET_FETCH_DETAIL sin listingId",
      permanent: true,
    };
  }

  const listing = await prisma.marketListing.findUnique({
    where: { id: payload.listingId },
    select: {
      id: true,
      source: true,
      externalId: true,
      canonicalUrl: true,
      advertiserType: true,
      advertiserName: true,
      phones: true,
      description: true,
      imageUrls: true,
      listingReference: true,
      cadastralRef: true,
      detailFetchAttempts: true,
    },
  });
  if (!listing) {
    return {
      success: false,
      error: `MARKET_FETCH_DETAIL listing ${payload.listingId} no existe`,
      permanent: true,
    };
  }

  const hasPhones = normalizePhones(listing.phones).length > 0;
  const hasDescription = (listing.description ?? "").trim().length > 0;
  const hasImages = listing.imageUrls.length > 0;
  const fichaCompleta = hasPhones && hasDescription && hasImages;
  if (fichaCompleta) {
    return { success: true };
  }

  if (listing.detailFetchAttempts >= MAX_DETAIL_FETCH_ATTEMPTS) {
    // Ya se intento el maximo. Marcamos el motivo si no hubo telefono.
    if (!hasPhones) {
      await prisma.marketListing
        .update({
          where: { id: listing.id },
          data: {
            captacionLastError: "phone_unavailable",
            captacionUpdatedAt: new Date(),
          },
        })
        .catch(() => undefined);
    }
    return { success: true };
  }

  const client = readWorkerClient();
  if (!client) {
    console.warn(
      "[market:fetch-detail] MARKET_WORKER_BASE_URL/SHARED_SECRET no configurados — skip",
    );
    return { success: true };
  }

  try {
    const traceId = `market-detail-${listing.id}-${randomUUID().slice(0, 8)}`;
    const detail = await client.runCrawlDetail({
      source: listing.source,
      canonicalUrl: listing.canonicalUrl,
      externalId: listing.externalId,
      // 45s para que el worker pueda hacer click + esperar AJAX. El cliente
      // tiene un margen extra (60s default) para no abortar antes que el worker.
      timeoutMs: Number(process.env.MARKET_DETAIL_TIMEOUT_MS ?? 45_000),
      traceId,
    });

    if (detail.status === "blocked") {
      // Increment attempts incluso en blocked para no reintentar infinitamente.
      await prisma.marketListing
        .update({
          where: { id: listing.id },
          data: {
            detailFetchAttempts: { increment: 1 },
            detailFetchedAt: new Date(),
          },
        })
        .catch(() => undefined);
      return { success: false, error: `Worker blocked: ${detail.reason}` };
    }
    if (detail.status === "failed") {
      const permanent = /FETCHER_NOT_FOUND|MISCONFIGURED/i.test(detail.errorCode);
      return {
        success: false,
        error: `Worker failed [${detail.errorCode}]: ${detail.errorReason}`,
        permanent,
      };
    }

    const mergedPhones = mergePhones(listing.phones, detail.phones);
    const phonesChanged =
      mergedPhones.length !== normalizePhones(listing.phones).length;

    // Description: preferimos la nueva si es mas larga o la actual estaba vacia.
    const newDescription =
      detail.description &&
      detail.description.length > (listing.description?.length ?? 0)
        ? detail.description
        : null;

    // ImageUrls: dedupear union (puede que la nueva captura traiga mas fotos).
    const mergedImageUrls = dedupeStrings([
      ...(listing.imageUrls ?? []),
      ...(detail.imageUrls ?? []),
    ]);
    const imagesChanged =
      mergedImageUrls.length > (listing.imageUrls?.length ?? 0);

    const newListingReference =
      detail.listingReference && detail.listingReference !== listing.listingReference
        ? detail.listingReference
        : null;
    const newCadastralRef =
      detail.cadastralRef && detail.cadastralRef !== listing.cadastralRef
        ? detail.cadastralRef
        : null;

    const newAdvertiserName =
      detail.advertiserName && detail.advertiserName !== listing.advertiserName
        ? detail.advertiserName
        : null;
    const newAdvertiserType =
      detail.advertiserType && detail.advertiserType !== listing.advertiserType
        ? detail.advertiserType
        : null;

    const followUpJobs: EnqueueJobInput[] = [];

    await prisma.marketListing.update({
      where: { id: listing.id },
      data: {
        phones: phonesChanged ? mergedPhones : undefined,
        description: newDescription ?? undefined,
        imageUrls: imagesChanged ? mergedImageUrls : undefined,
        // mainImageUrl: si no tenia y ahora hay imagenes, usar la primera.
        mainImageUrl:
          imagesChanged && mergedImageUrls.length > 0
            ? mergedImageUrls[0]
            : undefined,
        listingReference: newListingReference ?? undefined,
        cadastralRef: newCadastralRef ?? undefined,
        advertiserName: newAdvertiserName ?? undefined,
        advertiserType: newAdvertiserType ?? undefined,
        detailFetchAttempts: { increment: 1 },
        detailFetchedAt: new Date(),
        captacionLastError:
          mergedPhones.length === 0 &&
          listing.detailFetchAttempts + 1 >= MAX_DETAIL_FETCH_ATTEMPTS
            ? "phone_unavailable"
            : null,
      },
    });

    if (phonesChanged || newAdvertiserName || newAdvertiserType) {
      followUpJobs.push({
        type: "MARKET_RESOLVE_ADVERTISER",
        payload: { listingId: listing.id },
        idempotencyKey: `market:advertiser:${listing.id}:detail:${Date.now()}`,
      });
    }

    return {
      success: true,
      followUpJobs: followUpJobs.length > 0 ? followUpJobs : undefined,
      scoredPayload: {
        listingId: listing.id,
        phonesCaptured: detail.phones.length,
        descriptionLength: detail.description?.length ?? 0,
        imagesCaptured: detail.imageUrls.length,
        clickedRevealPhone: detail.clickedRevealPhone,
        strategy: detail.strategy,
      },
    };
  } catch (err) {
    if (err instanceof MarketWorkerError) {
      const permanent = err.code === "MISCONFIGURED" || err.code === "UNAUTHORIZED";
      return {
        success: false,
        error: `MarketWorkerError[${err.code}]: ${err.message}`,
        permanent,
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
