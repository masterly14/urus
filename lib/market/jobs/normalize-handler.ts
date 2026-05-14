/**
 * Handler MARKET_NORMALIZE_BATCH.
 *
 * Lee `MarketRawListing` con `status = CAPTURED` y los convierte en
 * `MarketListing` canonico via `normalizeRawListing` + `applyQuality`.
 * Marca cada raw como `NORMALIZED` (o `REJECTED` con motivo si falla).
 *
 * Idempotencia: se basa en el unique `(source, contentHash)` de
 * `MarketRawListing` y `(source, externalId)` de `MarketListing`. La
 * `idempotencyKey` del job (`market:normalize:{contentHash}`) impide
 * que dos workers procesen el mismo raw a la vez.
 *
 * Follow-ups: por cada listing creado/actualizado encola
 * `MARKET_RESOLVE_IDENTITY` con `idempotencyKey = market:identity:{listingId}`.
 *
 * Ver:
 *   - docs/core-mvp-status.md §3.1
 *   - lib/market/normalize.ts (funcion pura)
 *   - lib/market/quality.ts (computeQuality / applyQuality)
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { JobRecord, EnqueueJobInput } from "@/lib/job-queue/types";
import {
  applyQuality,
  normalizeRawListing,
  type CanonicalListing,
  type MarketSource,
  type RawListing,
  type RawListingPayload,
} from "@/lib/market";
import type { HandlerResult } from "@/lib/workers/consumer/types";

const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 200;

interface NormalizePayload {
  /** Si se pasa, procesa solo ese raw. Si no, drena por batch. */
  rawListingId?: string;
  /** Tamaño del batch cuando se drena (default 50). */
  batchSize?: number;
  /** Si se pasa, restringe a esa source. Útil para debug por portal. */
  source?: MarketSource;
}

interface NormalizeStats {
  scanned: number;
  normalized: number;
  rejected: number;
  followUpsEnqueued: number;
}

interface SeedContext {
  city: string;
  zone: string | null;
  source: MarketSource;
}

/**
 * Resuelve `(city, zone)` consultando el seed que originó el run de la
 * captura. Cachea por `crawlRunId` dentro del batch para evitar N consultas.
 */
async function resolveSeedContext(
  cache: Map<string, SeedContext>,
  crawlRunId: string,
): Promise<SeedContext | null> {
  const cached = cache.get(crawlRunId);
  if (cached) return cached;

  const run = await prisma.marketCrawlRun.findUnique({
    where: { id: crawlRunId },
    include: { seed: true },
  });
  if (!run || !run.seed) return null;

  const ctx: SeedContext = {
    city: run.seed.city,
    zone: run.seed.zone,
    source: run.seed.source,
  };
  cache.set(crawlRunId, ctx);
  return ctx;
}

function buildRawListing(args: {
  source: MarketSource;
  externalId: string | null;
  canonicalUrl: string;
  httpStatus: number | null;
  contentHash: string;
  payload: Prisma.JsonValue;
  capturedAt: Date;
}): RawListing {
  return {
    source: args.source,
    externalId: args.externalId,
    canonicalUrl: args.canonicalUrl,
    httpStatus: args.httpStatus,
    contentHash: args.contentHash,
    payload: (args.payload ?? {}) as unknown as RawListingPayload,
    capturedAt: args.capturedAt.toISOString(),
  };
}

/**
 * Upsert del listing canonico. Si existe, actualiza `lastSeenAt` y todos los
 * campos que pueden cambiar entre capturas; preserva `firstSeenAt` y
 * `propertyId` (la identidad la resuelve el siguiente job).
 */
async function upsertCanonicalListing(
  listing: CanonicalListing,
): Promise<{ id: string; created: boolean }> {
  const existing = await prisma.marketListing.findUnique({
    where: {
      source_externalId: {
        source: listing.source,
        externalId: listing.externalId,
      },
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.marketListing.update({
      where: { id: existing.id },
      data: {
        canonicalUrl: listing.canonicalUrl,
        operation: listing.operation,
        housingType: listing.housingType,
        status: listing.status,
        price: listing.price,
        currency: listing.currency,
        pricePerMeter: listing.pricePerMeter,
        builtArea: listing.builtArea,
        rooms: listing.rooms,
        bathrooms: listing.bathrooms,
        floor: listing.floor,
        city: listing.city,
        zone: listing.zone,
        addressApprox: listing.addressApprox,
        lat: listing.lat,
        lng: listing.lng,
        geohash: listing.geohash,
        advertiserType: listing.advertiserType,
        advertiserName: listing.advertiserName,
        phones: listing.phones,
        mainImageUrl: listing.mainImageUrl,
        imageUrls: listing.imageUrls,
        qualityScore: listing.qualityScore,
        qualityFlags: listing.qualityFlags,
        lastSeenAt: new Date(listing.lastSeenAt),
      },
    });
    return { id: existing.id, created: false };
  }

  const created = await prisma.marketListing.create({
    data: {
      source: listing.source,
      externalId: listing.externalId,
      canonicalUrl: listing.canonicalUrl,
      operation: listing.operation,
      housingType: listing.housingType,
      status: listing.status,
      price: listing.price,
      currency: listing.currency,
      pricePerMeter: listing.pricePerMeter,
      builtArea: listing.builtArea,
      rooms: listing.rooms,
      bathrooms: listing.bathrooms,
      floor: listing.floor,
      city: listing.city,
      zone: listing.zone,
      addressApprox: listing.addressApprox,
      lat: listing.lat,
      lng: listing.lng,
      geohash: listing.geohash,
      advertiserType: listing.advertiserType,
      advertiserName: listing.advertiserName,
      phones: listing.phones,
      mainImageUrl: listing.mainImageUrl,
      imageUrls: listing.imageUrls,
      qualityScore: listing.qualityScore,
      qualityFlags: listing.qualityFlags,
      firstSeenAt: new Date(listing.firstSeenAt),
      lastSeenAt: new Date(listing.lastSeenAt),
    },
    select: { id: true },
  });
  return { id: created.id, created: true };
}

export async function handleMarketNormalizeBatch(
  job: JobRecord,
): Promise<HandlerResult> {
  const payload = (job.payload ?? {}) as NormalizePayload;
  const batchSize = Math.min(
    Math.max(1, payload.batchSize ?? DEFAULT_BATCH_SIZE),
    MAX_BATCH_SIZE,
  );

  const where: Prisma.MarketRawListingWhereInput = payload.rawListingId
    ? { id: payload.rawListingId }
    : { status: "CAPTURED" };
  if (payload.source) where.source = payload.source;

  const raws = await prisma.marketRawListing.findMany({
    where,
    orderBy: { capturedAt: "asc" },
    take: payload.rawListingId ? 1 : batchSize,
  });

  if (raws.length === 0) {
    console.log("[market:normalize] sin raws CAPTURED — no-op");
    return { success: true };
  }

  const seedCache = new Map<string, SeedContext>();
  const stats: NormalizeStats = {
    scanned: 0,
    normalized: 0,
    rejected: 0,
    followUpsEnqueued: 0,
  };
  const followUpJobs: EnqueueJobInput[] = [];

  for (const raw of raws) {
    stats.scanned++;

    const ctx = await resolveSeedContext(seedCache, raw.crawlRunId);
    if (!ctx) {
      await prisma.marketRawListing.update({
        where: { id: raw.id },
        data: {
          status: "REJECTED",
          rejectionReason: `crawlRun ${raw.crawlRunId} sin seed asociado`,
        },
      });
      stats.rejected++;
      console.warn(
        `[market:normalize] raw=${raw.id} sin seed (run=${raw.crawlRunId}) → REJECTED`,
      );
      continue;
    }

    const rawInput = buildRawListing({
      source: raw.source,
      externalId: raw.externalId,
      canonicalUrl: raw.canonicalUrl,
      httpStatus: raw.httpStatus,
      contentHash: raw.contentHash,
      payload: raw.payload,
      capturedAt: raw.capturedAt,
    });

    const normalized = normalizeRawListing(rawInput, {
      defaultOperation: "sale",
      defaultCity: ctx.city,
      defaultZone: ctx.zone,
      now: new Date(),
    });

    if (!normalized.ok) {
      await prisma.marketRawListing.update({
        where: { id: raw.id },
        data: {
          status: "REJECTED",
          rejectionReason: normalized.reason,
        },
      });
      stats.rejected++;
      console.warn(
        `[market:normalize] raw=${raw.id} → REJECTED reason=${normalized.reason}`,
      );
      continue;
    }

    const withQuality = applyQuality(normalized.listing);
    const { id: listingId, created } = await upsertCanonicalListing(withQuality);

    await prisma.marketRawListing.update({
      where: { id: raw.id },
      data: { status: "NORMALIZED", rejectionReason: null },
    });

    stats.normalized++;
    followUpJobs.push({
      type: "MARKET_RESOLVE_IDENTITY",
      payload: { listingId, source: raw.source },
      idempotencyKey: `market:identity:${listingId}`,
    });

    // Política nueva (mayo 2026): encolamos detail interactivo para todo
    // listing nuevo cuando la ficha NO esta completa (sin telefono o sin
    // descripcion o sin fotos). Aplica tanto a particulares como a agencias
    // — el worker hace click "Ver telefono" y reproduce el flujo del
    // navegador. La concurrencia del worker (4) y los reintentos limitados
    // (3) protegen de saturacion.
    const hasPhones = withQuality.phones.length > 0;
    const hasImages = withQuality.imageUrls.length > 0;
    // En la fase de normalize aun no tenemos description (la trae el detail);
    // por eso solo evaluamos phones+imagenes aqui.
    const fichaIncompleta = !hasPhones || !hasImages;
    if (fichaIncompleta) {
      followUpJobs.push({
        type: "MARKET_FETCH_DETAIL",
        payload: { listingId },
        idempotencyKey: `market:fetch-detail:${listingId}`,
        maxAttempts: 3,
      });
    }

    console.log(
      `[market:normalize] raw=${raw.id} → listing=${listingId} ${
        created ? "(NEW)" : "(UPDATED)"
      } quality=${withQuality.qualityScore} flags=${withQuality.qualityFlags.join(",") || "-"}`,
    );
  }

  // Si todavía quedan raws CAPTURED (drenamos solo `batchSize`), encolamos
  // otro `MARKET_NORMALIZE_BATCH` con idempotency-key por minuto para
  // mantener la cola viva sin acumular jobs duplicados.
  if (!payload.rawListingId && raws.length === batchSize) {
    const minuteBucket = Math.floor(Date.now() / 60_000);
    followUpJobs.push({
      type: "MARKET_NORMALIZE_BATCH",
      payload: { batchSize },
      idempotencyKey: `market:normalize-batch:${minuteBucket}`,
    });
  }

  stats.followUpsEnqueued = followUpJobs.length;
  console.log(
    `[market:normalize] batch terminado — scanned=${stats.scanned} normalized=${stats.normalized} rejected=${stats.rejected} follow-ups=${stats.followUpsEnqueued}`,
  );

  return { success: true, followUpJobs };
}
