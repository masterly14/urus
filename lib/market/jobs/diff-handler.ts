/**
 * Handler MARKET_DIFF_AND_VERSION.
 *
 * Compara el estado actual de un `MarketListing` contra su ultima
 * `MarketListingVersion`. Si hay cambios relevantes:
 *  1. Inserta una nueva `MarketListingVersion` con `before/after/changedFields`.
 *  2. Inserta `MarketEvent` con `type` derivado del diff y `fingerprint`
 *     deterministico (idempotencia via constraint @unique [type, fingerprint]).
 *  3. Actualiza `MarketListing.lastChangeAt`.
 *
 * Si no hay cambios (segunda captura identica), termina como no-op exitoso.
 *
 * Idempotencia:
 *   - `idempotencyKey = market:diff:{listingId}:{lastSeenAtMs}` impide reentrada.
 *   - Si el cron repite el job tras un fallo, el `eventFingerprint` derivado
 *     de `(listingId, type, before/after)` evita evento duplicado.
 *
 * Ver:
 *   - lib/market/diff.ts (modulo puro)
 *   - docs/core-mvp-status.md §3.2
 */

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { JobRecord } from "@/lib/job-queue/types";
import {
  diffListing,
  type CanonicalListing,
  type ListingDiff,
  type MarketSource,
  type QualityFlag,
} from "@/lib/market";
import type { HandlerResult } from "@/lib/workers/consumer/types";

interface DiffPayload {
  listingId?: string;
}

function rowToCanonical(
  row: Awaited<ReturnType<typeof prisma.marketListing.findUnique>>,
): CanonicalListing | null {
  if (!row) return null;
  return {
    source: row.source as MarketSource,
    externalId: row.externalId,
    canonicalUrl: row.canonicalUrl,
    operation: row.operation,
    housingType: row.housingType,
    status: row.status,
    price: row.price,
    currency: row.currency,
    pricePerMeter: row.pricePerMeter,
    builtArea: row.builtArea,
    rooms: row.rooms,
    bathrooms: row.bathrooms,
    floor: row.floor,
    city: row.city,
    zone: row.zone,
    addressApprox: row.addressApprox,
    lat: row.lat,
    lng: row.lng,
    geohash: row.geohash,
    advertiserType: row.advertiserType,
    advertiserName: row.advertiserName,
    phones: row.phones,
    mainImageUrl: row.mainImageUrl,
    imageUrls: row.imageUrls,
    qualityScore: row.qualityScore,
    qualityFlags: row.qualityFlags as QualityFlag[],
    propertyId: row.propertyId,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    lastChangeAt: row.lastChangeAt ? row.lastChangeAt.toISOString() : null,
  };
}

/**
 * Reconstruye el "estado previo" desde la ultima `MarketListingVersion`.
 * Cada version guarda solo los campos cambiados; combinandolas en orden
 * cronologico contra el estado inicial (la primera version) deberiamos
 * obtener el snapshot anterior. En MVP simplificamos: usamos el `after` de
 * la ultima version como aproximacion del estado previo. Esto es correcto
 * cuando el listing solo cambia en los campos versionados (que es la mayoria
 * de casos), y suficientemente bueno para detectar el siguiente cambio.
 */
function previousFromVersion(
  version: { after: unknown } | null,
): CanonicalListing | null {
  if (!version) return null;
  const after = version.after as Partial<CanonicalListing>;
  if (!after || typeof after !== "object") return null;
  // Si por algun motivo el `after` no tiene los campos minimos, lo tratamos
  // como ausente para forzar una creacion logica (no rompera idempotencia
  // gracias al fingerprint del evento).
  if (!after.source || !after.externalId) return null;
  return after as CanonicalListing;
}

function buildEventFingerprint(args: {
  listingId: string;
  type: string;
  diff: ListingDiff;
}): string {
  const fieldsKey = args.diff.changedFields.slice().sort().join(",");
  const beforeKey = stableHash(args.diff.before);
  const afterKey = stableHash(args.diff.after);
  return createHash("sha256")
    .update([args.listingId, args.type, fieldsKey, beforeKey, afterKey].join("|"))
    .digest("hex");
}

function stableHash(obj: unknown): string {
  if (obj == null) return "null";
  return createHash("sha1")
    .update(JSON.stringify(obj, Object.keys(obj as object).sort()))
    .digest("hex")
    .slice(0, 16);
}

export async function handleMarketDiffAndVersion(
  job: JobRecord,
): Promise<HandlerResult> {
  const payload = (job.payload ?? {}) as DiffPayload;
  const listingId =
    typeof payload.listingId === "string" ? payload.listingId.trim() : "";
  if (!listingId) {
    return {
      success: false,
      error: "MARKET_DIFF_AND_VERSION requiere payload.listingId",
      permanent: true,
    };
  }

  const row = await prisma.marketListing.findUnique({ where: { id: listingId } });
  const current = rowToCanonical(row);
  if (!row || !current) {
    return {
      success: false,
      error: `MarketListing ${listingId} no existe`,
      permanent: true,
    };
  }

  const lastVersion = await prisma.marketListingVersion.findFirst({
    where: { listingId },
    orderBy: { capturedAt: "desc" },
  });

  const prev = previousFromVersion(lastVersion);
  const diff = diffListing(prev, current);

  if (!diff.eventType) {
    console.log(`[market:diff] listing=${listingId} sin cambios — no-op`);
    return { success: true };
  }

  const eventFp = buildEventFingerprint({
    listingId,
    type: diff.eventType,
    diff,
  });

  // Insert version + event + update lastChangeAt en transaccion para
  // garantizar consistencia. Si el evento ya existe (P2002), capturamos
  // y mantenemos exito (idempotencia). En ese caso tampoco insertamos
  // version duplicada.
  const eventExists = await prisma.marketEvent.findUnique({
    where: {
      type_fingerprint: { type: diff.eventType, fingerprint: eventFp },
    },
    select: { id: true },
  });

  if (eventExists) {
    console.log(
      `[market:diff] listing=${listingId} evento ${diff.eventType} ya existe (idempotencia) — skip`,
    );
    return { success: true };
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.marketListingVersion.create({
      data: {
        listingId,
        changedFields: diff.changedFields,
        before: diff.before as object,
        after: diff.after as object,
        capturedAt: now,
      },
    }),
    prisma.marketEvent.create({
      data: {
        type: diff.eventType,
        listingId,
        propertyId: row.propertyId,
        source: row.source,
        payload: {
          listingId,
          changedFields: diff.changedFields,
          before: diff.before,
          after: diff.after,
          priceDelta: diff.priceDelta,
        },
        fingerprint: eventFp,
        correlationId: job.id,
        occurredAt: now,
      },
    }),
    prisma.marketListing.update({
      where: { id: listingId },
      data: { lastChangeAt: now },
    }),
  ]);

  console.log(
    `[market:diff] listing=${listingId} → ${diff.eventType} fields=${diff.changedFields.join(",")}`,
  );
  return { success: true };
}
