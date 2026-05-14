/**
 * Handler MARKET_RESOLVE_IDENTITY.
 *
 * Para cada `MarketListing` recien normalizado:
 *  1. Calcula `fingerprint = computePropertyFingerprint(...)`.
 *  2. Si existe `MarketProperty` con ese fingerprint → asigna `propertyId`
 *     directamente (auto-merge deterministico).
 *  3. Si no, busca candidatos por `(city, zone, builtArea ± 5%, rooms)` y
 *     aplica `computePropertySimilarity`. Decide:
 *       - score >= 0.90 → reusa `propertyId` del candidato y emite
 *         `MARKET_PROPERTY_MERGED`.
 *       - 0.70 <= score < 0.90 → deja `propertyId = null` y emite
 *         `MARKET_PROPERTY_REVIEW_REQUIRED` con candidatos.
 *       - score < 0.70 → crea `MarketProperty` nueva.
 *  4. Encola follow-ups `MARKET_RESOLVE_ADVERTISER` y `MARKET_DIFF_AND_VERSION`.
 *
 * Idempotencia:
 *   - `idempotencyKey = market:identity:{listingId}`.
 *   - `MarketProperty.fingerprint` es @unique en schema.
 *   - `MarketEvent (type, fingerprint)` es @unique en schema.
 *
 * Ver:
 *   - lib/market/identity.ts (modulo puro: fingerprint + similarity)
 *   - docs/core-sistema-mercado-decisiones.md §4 (umbrales 0.90 / 0.70)
 *   - docs/core-mvp-status.md §3.1
 */

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { JobRecord, EnqueueJobInput } from "@/lib/job-queue/types";
import {
  computePropertyFingerprint,
  computePropertySimilarity,
  IDENTITY_AUTO_MERGE_THRESHOLD,
  IDENTITY_MANUAL_REVIEW_THRESHOLD,
  type MarketSource,
  type PropertyFingerprintInput,
} from "@/lib/market";
import type { HandlerResult } from "@/lib/workers/consumer/types";

interface ResolveIdentityPayload {
  listingId?: string;
  source?: MarketSource;
}

interface ListingForIdentity {
  id: string;
  source: MarketSource;
  externalId: string;
  city: string;
  zone: string | null;
  geohash: string | null;
  builtArea: number | null;
  rooms: number | null;
  bathrooms: number | null;
  floor: string | null;
  housingType: PropertyFingerprintInput["housingType"];
  operation: PropertyFingerprintInput["operation"];
  addressApprox: string | null;
  propertyId: string | null;
}

function toFingerprintInput(listing: ListingForIdentity): PropertyFingerprintInput {
  return {
    city: listing.city,
    zone: listing.zone,
    builtArea: listing.builtArea,
    rooms: listing.rooms,
    bathrooms: listing.bathrooms,
    floor: listing.floor,
    geohash: listing.geohash,
    housingType: listing.housingType,
    operation: listing.operation,
    addressApprox: listing.addressApprox,
  };
}

/**
 * Busca candidatos a merge dentro del mismo `(city, operation, housingType)`,
 * con tolerancia en area construida (±5%) y rooms exactos. Excluye el propio
 * listing y los que ya tienen `propertyId = null` con score < 0.70 (no nos
 * interesan). Limita a 25 candidatos para acotar coste.
 */
async function findMergeCandidates(
  listing: ListingForIdentity,
): Promise<ListingForIdentity[]> {
  if (listing.builtArea == null || listing.rooms == null) {
    // Sin area o rooms no podemos hacer merge cross-source con confianza.
    return [];
  }
  const areaMin = listing.builtArea * 0.95;
  const areaMax = listing.builtArea * 1.05;

  const candidates = await prisma.marketListing.findMany({
    where: {
      id: { not: listing.id },
      city: listing.city,
      operation: listing.operation,
      housingType: listing.housingType,
      builtArea: { gte: areaMin, lte: areaMax },
      rooms: listing.rooms,
      // Solo candidatos con propertyId asignado (otros listings ya clusterizados)
      // o candidatos huerfanos. Si esta huerfano, igual lo consideramos para
      // poder fundir cross-source incluso en su primer encuentro.
    },
    select: {
      id: true,
      source: true,
      externalId: true,
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
      propertyId: true,
    },
    take: 25,
  });

  return candidates as ListingForIdentity[];
}

interface BestCandidate {
  listing: ListingForIdentity;
  score: number;
}

function pickBestCandidate(
  current: ListingForIdentity,
  candidates: ListingForIdentity[],
): BestCandidate | null {
  if (candidates.length === 0) return null;
  let best: BestCandidate | null = null;
  for (const candidate of candidates) {
    const result = computePropertySimilarity(
      toFingerprintInput(current),
      toFingerprintInput(candidate),
    );
    if (!best || result.score > best.score) {
      best = { listing: candidate, score: result.score };
    }
  }
  return best;
}

function eventFingerprint(parts: readonly (string | number)[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

async function attachToProperty(
  listingId: string,
  propertyId: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.marketListing.update({
      where: { id: listingId },
      data: { propertyId },
    }),
    prisma.marketProperty.update({
      where: { id: propertyId },
      data: {
        listingsCount: { increment: 1 },
        lastSeenAt: new Date(),
      },
    }),
  ]);
}

async function createPropertyForListing(
  listing: ListingForIdentity,
  fingerprint: string,
): Promise<string> {
  // Race-safe: otro worker puede haber creado la property con el mismo
  // fingerprint en paralelo. Captamos el constraint y reusamos.
  try {
    const created = await prisma.marketProperty.create({
      data: {
        city: listing.city,
        zone: listing.zone,
        geohash: listing.geohash,
        fingerprint,
        representativeListingId: listing.id,
        listingsCount: 1,
      },
      select: { id: true },
    });
    await prisma.marketListing.update({
      where: { id: listing.id },
      data: { propertyId: created.id },
    });
    return created.id;
  } catch (err) {
    const existing = await prisma.marketProperty.findUnique({
      where: { fingerprint },
      select: { id: true },
    });
    if (!existing) throw err;
    await attachToProperty(listing.id, existing.id);
    return existing.id;
  }
}

export async function handleMarketResolveIdentity(
  job: JobRecord,
): Promise<HandlerResult> {
  const payload = (job.payload ?? {}) as ResolveIdentityPayload;
  const listingId =
    typeof payload.listingId === "string" ? payload.listingId.trim() : "";
  if (!listingId) {
    return {
      success: false,
      error: "MARKET_RESOLVE_IDENTITY requiere payload.listingId",
      permanent: true,
    };
  }

  const listing = await prisma.marketListing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      source: true,
      externalId: true,
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
      propertyId: true,
      lastSeenAt: true,
    },
  });
  if (!listing) {
    return {
      success: false,
      error: `MarketListing ${listingId} no existe`,
      permanent: true,
    };
  }

  const fingerprint = computePropertyFingerprint(
    toFingerprintInput(listing as ListingForIdentity),
  );

  // Camino 1: fingerprint identico → auto-merge deterministico.
  const exact = await prisma.marketProperty.findUnique({
    where: { fingerprint },
    select: { id: true },
  });

  let resolvedPropertyId: string | null = null;
  let decision: "exact" | "auto-merge" | "manual-review" | "new" | "noop" = "noop";
  let mergedScore: number | null = null;
  let candidateListingIds: string[] = [];

  if (exact) {
    if (listing.propertyId !== exact.id) {
      await attachToProperty(listing.id, exact.id);
    }
    resolvedPropertyId = exact.id;
    decision = "exact";
  } else {
    // Camino 2: similitud cross-portal con candidatos.
    const candidates = await findMergeCandidates(listing as ListingForIdentity);
    const best = pickBestCandidate(listing as ListingForIdentity, candidates);

    if (best && best.score >= IDENTITY_AUTO_MERGE_THRESHOLD) {
      mergedScore = best.score;
      // Si el candidato ya tiene propertyId, fundimos a esa property.
      // Si no, creamos una para ambos y los vinculamos.
      if (best.listing.propertyId) {
        await attachToProperty(listing.id, best.listing.propertyId);
        resolvedPropertyId = best.listing.propertyId;
      } else {
        resolvedPropertyId = await createPropertyForListing(
          listing as ListingForIdentity,
          fingerprint,
        );
        await attachToProperty(best.listing.id, resolvedPropertyId);
      }
      decision = "auto-merge";
    } else if (
      best &&
      best.score >= IDENTITY_MANUAL_REVIEW_THRESHOLD
    ) {
      mergedScore = best.score;
      candidateListingIds = candidates.map((c) => c.id);
      // Dejamos propertyId = null. Se encola evento de revision manual.
      decision = "manual-review";
    } else {
      // Camino 3: ningun candidato suficientemente similar → property nueva.
      resolvedPropertyId = await createPropertyForListing(
        listing as ListingForIdentity,
        fingerprint,
      );
      decision = "new";
    }
  }

  // Emision de eventos. Idempotencia por (type, fingerprint) unique.
  if (decision === "auto-merge" || decision === "exact") {
    const eventFp = eventFingerprint([
      "MARKET_PROPERTY_MERGED",
      listing.id,
      resolvedPropertyId ?? "-",
    ]);
    await prisma.marketEvent
      .create({
        data: {
          type: "MARKET_PROPERTY_MERGED",
          listingId: listing.id,
          propertyId: resolvedPropertyId,
          source: listing.source,
          payload: {
            listingId: listing.id,
            propertyId: resolvedPropertyId,
            decision,
            score: mergedScore,
          },
          fingerprint: eventFp,
          correlationId: job.id,
        },
      })
      .catch((err: Error) => {
        // Si ya existe (P2002), no hacemos ruido: idempotencia OK.
        if (!/Unique constraint/i.test(err.message)) throw err;
      });
  } else if (decision === "manual-review") {
    const eventFp = eventFingerprint([
      "MARKET_PROPERTY_REVIEW_REQUIRED",
      listing.id,
      ...candidateListingIds,
    ]);
    await prisma.marketEvent
      .create({
        data: {
          type: "MARKET_PROPERTY_REVIEW_REQUIRED",
          listingId: listing.id,
          source: listing.source,
          payload: {
            listingId: listing.id,
            score: mergedScore,
            candidateListingIds,
          },
          fingerprint: eventFp,
          correlationId: job.id,
        },
      })
      .catch((err: Error) => {
        if (!/Unique constraint/i.test(err.message)) throw err;
      });
  }

  console.log(
    `[market:identity] listing=${listing.id} decision=${decision} score=${mergedScore ?? "-"} property=${resolvedPropertyId ?? "(none)"}`,
  );

  const followUpJobs: EnqueueJobInput[] = [
    {
      type: "MARKET_RESOLVE_ADVERTISER",
      payload: { listingId: listing.id },
      idempotencyKey: `market:advertiser:${listing.id}`,
    },
    {
      type: "MARKET_DIFF_AND_VERSION",
      payload: { listingId: listing.id },
      idempotencyKey: `market:diff:${listing.id}:${listing.lastSeenAt.getTime()}`,
    },
  ];

  return { success: true, followUpJobs };
}
