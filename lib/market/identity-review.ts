/**
 * Identity review queue — servicio interno.
 *
 * El handler MARKET_RESOLVE_IDENTITY emite MARKET_PROPERTY_REVIEW_REQUIRED
 * cuando el score de similitud cae en [0.70, 0.90) (decisiones.md §4.2).
 * Hasta ahora estos eventos quedaban como log; este modulo los expone como
 * cola de candidatos para que un admin decida manualmente.
 *
 * Decisiones MVP (confirmar antes de produccion):
 *  - "merge": fundir LISTING_A en la MarketProperty MAS ANTIGUA del par
 *    (preserva el cluster establecido y referencias en otros consumidores).
 *  - Mostramos solo eventos con `resolvedAt IS NULL`. Eventos auto-merged
 *    (score >= 0.90) no se muestran (se asumen correctos; auditoria via
 *    MARKET_PROPERTY_MERGED).
 */

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { MarketSource } from "./types";

export interface ReviewListingMini {
  id: string;
  source: MarketSource;
  externalId: string;
  canonicalUrl: string;
  city: string;
  zone: string | null;
  addressApprox: string | null;
  builtArea: number | null;
  rooms: number | null;
  bathrooms: number | null;
  floor: string | null;
  price: number | null;
  pricePerMeter: number | null;
  mainImageUrl: string | null;
  advertiserDisplayName: string | null;
  advertiserType: string | null;
  propertyId: string | null;
  qualityScore: number;
  lastSeenAt: string;
}

export interface ReviewCandidate {
  /** id del MarketEvent MARKET_PROPERTY_REVIEW_REQUIRED. */
  eventId: string;
  /** Score de similitud sugerido por identity.ts. */
  score: number | null;
  /** Listing origen (el que dispara el evento). */
  origin: ReviewListingMini;
  /** Mejor candidato (el primero del array `candidateListingIds`). */
  bestCandidate: ReviewListingMini | null;
  /** Otros candidatos para mostrar contexto. */
  otherCandidates: ReviewListingMini[];
  emittedAt: string;
}

export interface ListReviewCandidatesResult {
  items: ReviewCandidate[];
  /** Total pendiente (todos los eventos con resolvedAt = NULL). */
  totalPending: number;
}

export async function listReviewCandidates(
  limit = 50,
): Promise<ListReviewCandidatesResult> {
  const safeLimit = Math.min(Math.max(1, limit), 100);
  const [events, totalPending] = await Promise.all([
    prisma.marketEvent.findMany({
      where: {
        type: "MARKET_PROPERTY_REVIEW_REQUIRED",
        resolvedAt: null,
      },
      orderBy: { occurredAt: "desc" },
      take: safeLimit,
    }),
    prisma.marketEvent.count({
      where: {
        type: "MARKET_PROPERTY_REVIEW_REQUIRED",
        resolvedAt: null,
      },
    }),
  ]);

  if (events.length === 0) {
    return { items: [], totalPending };
  }

  const listingIds = new Set<string>();
  for (const event of events) {
    if (event.listingId) listingIds.add(event.listingId);
    const payload = (event.payload ?? {}) as {
      candidateListingIds?: string[];
    };
    for (const id of payload.candidateListingIds ?? []) listingIds.add(id);
  }

  const listings = await prisma.marketListing.findMany({
    where: { id: { in: Array.from(listingIds) } },
    include: {
      advertiser: {
        select: {
          displayName: true,
          advertiserType: true,
        },
      },
    },
  });
  const listingById = new Map<string, (typeof listings)[number]>();
  for (const l of listings) listingById.set(l.id, l);

  const items: ReviewCandidate[] = [];
  for (const event of events) {
    if (!event.listingId) continue;
    const origin = listingById.get(event.listingId);
    if (!origin) continue;

    const payload = (event.payload ?? {}) as {
      candidateListingIds?: string[];
      score?: number;
    };
    const candidateIds = payload.candidateListingIds ?? [];
    const candidates: ReviewListingMini[] = candidateIds
      .map((id) => listingById.get(id))
      .filter((l): l is (typeof listings)[number] => Boolean(l))
      .map(toReviewMini);

    items.push({
      eventId: event.id,
      score: typeof payload.score === "number" ? payload.score : null,
      origin: toReviewMini(origin),
      bestCandidate: candidates[0] ?? null,
      otherCandidates: candidates.slice(1),
      emittedAt: event.occurredAt.toISOString(),
    });
  }

  return { items, totalPending };
}

function toReviewMini(
  listing: Awaited<ReturnType<typeof prisma.marketListing.findFirst>> & {
    advertiser?: { displayName: string | null; advertiserType: string | null } | null;
  },
): ReviewListingMini {
  return {
    id: listing!.id,
    source: listing!.source,
    externalId: listing!.externalId,
    canonicalUrl: listing!.canonicalUrl,
    city: listing!.city,
    zone: listing!.zone,
    addressApprox: listing!.addressApprox,
    builtArea: listing!.builtArea,
    rooms: listing!.rooms,
    bathrooms: listing!.bathrooms,
    floor: listing!.floor,
    price: listing!.price,
    pricePerMeter: listing!.pricePerMeter,
    mainImageUrl: listing!.mainImageUrl,
    advertiserDisplayName:
      listing!.advertiser?.displayName ?? listing!.advertiserName,
    advertiserType:
      listing!.advertiser?.advertiserType ?? listing!.advertiserType,
    propertyId: listing!.propertyId,
    qualityScore: listing!.qualityScore,
    lastSeenAt: listing!.lastSeenAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Resolve
// ---------------------------------------------------------------------------

export type ResolveAction = "merge" | "split" | "ignore";

export interface ResolveCandidateInput {
  eventId: string;
  action: ResolveAction;
  /** id del listing a fundir cuando action === "merge". Por defecto: el primer candidato del payload. */
  targetListingId?: string;
  /** userId del admin que resuelve (para auditoria). */
  resolvedBy: string;
}

export interface ResolveCandidateResult {
  ok: true;
  action: ResolveAction;
  /** propertyId del cluster final cuando action === "merge". */
  resolvedPropertyId: string | null;
  /** listingId del listing afectado. */
  listingId: string;
}

function resolutionFingerprint(
  parts: readonly (string | number)[],
): string {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

export async function resolveCandidate(
  input: ResolveCandidateInput,
): Promise<ResolveCandidateResult> {
  const event = await prisma.marketEvent.findUnique({
    where: { id: input.eventId },
  });
  if (!event) throw new Error("Evento no encontrado");
  if (event.type !== "MARKET_PROPERTY_REVIEW_REQUIRED") {
    throw new Error("Evento no es de revision de identidad");
  }
  if (event.resolvedAt) {
    return {
      ok: true,
      action: (event.resolutionAction as ResolveAction) ?? "ignore",
      resolvedPropertyId: event.propertyId,
      listingId: event.listingId ?? "",
    };
  }
  if (!event.listingId) throw new Error("Evento sin listingId");

  const payload = (event.payload ?? {}) as {
    candidateListingIds?: string[];
    score?: number;
  };
  const targetListingId =
    input.targetListingId ?? payload.candidateListingIds?.[0];

  let resolvedPropertyId: string | null = event.propertyId;

  if (input.action === "merge") {
    if (!targetListingId) throw new Error("merge requiere targetListingId");

    const [origin, candidate] = await Promise.all([
      prisma.marketListing.findUnique({
        where: { id: event.listingId },
        select: {
          id: true,
          propertyId: true,
          city: true,
          zone: true,
          geohash: true,
          builtArea: true,
          rooms: true,
          bathrooms: true,
          floor: true,
          housingType: true,
          operation: true,
          addressApprox: true,
        },
      }),
      prisma.marketListing.findUnique({
        where: { id: targetListingId },
        select: {
          id: true,
          propertyId: true,
          city: true,
          zone: true,
          geohash: true,
        },
      }),
    ]);
    if (!origin || !candidate) throw new Error("Listings no encontrados");

    const propertyId = await mergeListings(origin, candidate);
    resolvedPropertyId = propertyId;

    // Auditoria: emite MARKET_PROPERTY_MERGED.
    const eventFp = resolutionFingerprint([
      "MARKET_PROPERTY_MERGED",
      "review",
      event.id,
    ]);
    await prisma.marketEvent
      .create({
        data: {
          type: "MARKET_PROPERTY_MERGED",
          listingId: origin.id,
          propertyId,
          payload: {
            decision: "manual-review",
            score: payload.score ?? null,
            candidateListingId: candidate.id,
            sourceEventId: event.id,
            resolvedBy: input.resolvedBy,
          },
          fingerprint: eventFp,
          correlationId: event.correlationId,
        },
      })
      .catch((err: Error) => {
        if (!/Unique constraint/i.test(err.message)) throw err;
      });
  } else if (input.action === "split") {
    // No hace falta tocar listings: ya estaban separados (origen sin propertyId).
    // Emitimos MARKET_PROPERTY_SPLIT como auditoria.
    const eventFp = resolutionFingerprint([
      "MARKET_PROPERTY_SPLIT",
      "review",
      event.id,
    ]);
    await prisma.marketEvent
      .create({
        data: {
          type: "MARKET_PROPERTY_SPLIT",
          listingId: event.listingId,
          payload: {
            decision: "manual-review",
            score: payload.score ?? null,
            candidateListingIds: payload.candidateListingIds ?? [],
            sourceEventId: event.id,
            resolvedBy: input.resolvedBy,
          },
          fingerprint: eventFp,
          correlationId: event.correlationId,
        },
      })
      .catch((err: Error) => {
        if (!/Unique constraint/i.test(err.message)) throw err;
      });
  }
  // action === "ignore": solo marcamos el evento como resuelto, sin auditoria extra.

  await prisma.marketEvent.update({
    where: { id: event.id },
    data: {
      resolvedAt: new Date(),
      resolvedBy: input.resolvedBy,
      resolutionAction: input.action,
    },
  });

  return {
    ok: true,
    action: input.action,
    resolvedPropertyId,
    listingId: event.listingId,
  };
}

interface MergeListingMini {
  id: string;
  propertyId: string | null;
  city: string;
  zone: string | null;
  geohash: string | null;
}

interface MergeOriginListingMini extends MergeListingMini {
  builtArea: number | null;
  rooms: number | null;
  bathrooms: number | null;
  floor: string | null;
  housingType: import("@prisma/client").MarketHousingType;
  operation: import("@prisma/client").MarketOperation;
  addressApprox: string | null;
}

async function mergeListings(
  origin: MergeOriginListingMini,
  candidate: MergeListingMini,
): Promise<string> {
  // Caso 1: candidato ya tiene property. Fundimos origen ahi.
  if (candidate.propertyId) {
    if (origin.propertyId !== candidate.propertyId) {
      await prisma.$transaction([
        prisma.marketListing.update({
          where: { id: origin.id },
          data: { propertyId: candidate.propertyId },
        }),
        prisma.marketProperty.update({
          where: { id: candidate.propertyId },
          data: {
            listingsCount: { increment: 1 },
            lastSeenAt: new Date(),
          },
        }),
      ]);
    }
    return candidate.propertyId;
  }

  // Caso 2: ninguno tiene property. Creamos una nueva con el fingerprint
  // del origen y vinculamos ambos.
  const { computePropertyFingerprint } = await import("./identity");
  const fingerprint = computePropertyFingerprint({
    city: origin.city,
    zone: origin.zone,
    builtArea: origin.builtArea,
    rooms: origin.rooms,
    bathrooms: origin.bathrooms,
    floor: origin.floor,
    geohash: origin.geohash,
    housingType: origin.housingType,
    operation: origin.operation,
    addressApprox: origin.addressApprox,
  });

  let propertyId: string;
  try {
    const created = await prisma.marketProperty.create({
      data: {
        city: origin.city,
        zone: origin.zone,
        geohash: origin.geohash,
        fingerprint,
        representativeListingId: origin.id,
        listingsCount: 2,
      },
      select: { id: true },
    });
    propertyId = created.id;
  } catch (err) {
    // Race con auto-merge: otro worker pudo haber creado la property
    // con el mismo fingerprint. Reusamos.
    const existing = await prisma.marketProperty.findUnique({
      where: { fingerprint },
      select: { id: true },
    });
    if (!existing) throw err;
    propertyId = existing.id;
  }

  await prisma.$transaction([
    prisma.marketListing.update({
      where: { id: origin.id },
      data: { propertyId },
    }),
    prisma.marketListing.update({
      where: { id: candidate.id },
      data: { propertyId },
    }),
  ]);
  return propertyId;
}
