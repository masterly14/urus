/**
 * Handler MARKET_REFRESH_SNAPSHOT.
 *
 * Recalcula `MarketSnapshotIndex` para una ciudad. Itera todas las
 * combinaciones (housingType, operation), calcula totales y medianas via
 * `computeSnapshotIndex` y hace upsert en la tabla. Emite un unico
 * `MARKET_SNAPSHOT_REFRESHED` por ciudad con fingerprint
 * `snapshot:{city}:{day}` para idempotencia diaria.
 *
 * Filtra por `MARKET_HOUSING_TYPES` activos (los del enum de Prisma) pero
 * deja al usuario opcion de pasar `housingTypes` filtrado para acotar el
 * computo en una sola operacion.
 *
 * Ver:
 *   - lib/market/snapshot.ts (modulo puro)
 *   - docs/core-mvp-status.md §3.2
 */

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { JobRecord } from "@/lib/job-queue/types";
import {
  computeSnapshotIndex,
  MARKET_HOUSING_TYPES,
  MARKET_OPERATIONS,
  type MarketHousingType,
  type MarketOperation,
  type SnapshotInputListing,
} from "@/lib/market";
import type { HandlerResult } from "@/lib/workers/consumer/types";

interface RefreshSnapshotPayload {
  city?: string;
  housingTypes?: MarketHousingType[];
  operations?: MarketOperation[];
  minQualityScore?: number;
}

const DEFAULT_MIN_QUALITY = 0.4;

function readMinQualityFromEnv(): number {
  const raw = process.env.MARKET_MIN_QUALITY_SCORE;
  if (!raw) return DEFAULT_MIN_QUALITY;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1
    ? parsed
    : DEFAULT_MIN_QUALITY;
}

export async function handleMarketRefreshSnapshot(
  job: JobRecord,
): Promise<HandlerResult> {
  const payload = (job.payload ?? {}) as RefreshSnapshotPayload;
  const city = typeof payload.city === "string" ? payload.city.trim() : "";
  if (!city) {
    return {
      success: false,
      error: "MARKET_REFRESH_SNAPSHOT requiere payload.city",
      permanent: true,
    };
  }

  const housingTypes = payload.housingTypes ?? MARKET_HOUSING_TYPES;
  const operations = payload.operations ?? MARKET_OPERATIONS;
  const minQualityScore =
    typeof payload.minQualityScore === "number"
      ? payload.minQualityScore
      : readMinQualityFromEnv();

  const now = new Date();
  let totalActiveAcrossCity = 0;
  let combinationsRefreshed = 0;

  for (const housingType of housingTypes) {
    for (const operation of operations) {
      const listings = await prisma.marketListing.findMany({
        where: {
          city,
          housingType,
          operation,
          status: "active",
        },
        select: {
          price: true,
          pricePerMeter: true,
          qualityScore: true,
          status: true,
        },
      });

      const inputs: SnapshotInputListing[] = listings.map((l) => ({
        price: l.price,
        pricePerMeter: l.pricePerMeter,
        qualityScore: l.qualityScore,
        status: l.status,
      }));

      const result = computeSnapshotIndex(inputs, {
        city,
        housingType,
        operation,
        minQualityScore,
        now,
      });

      await prisma.marketSnapshotIndex.upsert({
        where: {
          city_housingType_operation: {
            city,
            housingType,
            operation,
          },
        },
        create: {
          city: result.city,
          housingType: result.housingType,
          operation: result.operation,
          freshAt: result.freshAt,
          totalActive: result.totalActive,
          priceMin: result.priceMin,
          priceMax: result.priceMax,
          priceMedian: result.priceMedian,
          ppmMedian: result.ppmMedian,
        },
        update: {
          freshAt: result.freshAt,
          totalActive: result.totalActive,
          priceMin: result.priceMin,
          priceMax: result.priceMax,
          priceMedian: result.priceMedian,
          ppmMedian: result.ppmMedian,
        },
      });

      totalActiveAcrossCity += result.totalActive;
      combinationsRefreshed++;
    }
  }

  // Evento por ciudad/dia. Si dos crons del mismo dia recalculan, el
  // fingerprint es el mismo y el unique evita duplicados.
  const dayBucket = now.toISOString().slice(0, 10);
  const eventFp = createHash("sha256")
    .update(`MARKET_SNAPSHOT_REFRESHED|${city}|${dayBucket}`)
    .digest("hex");

  await prisma.marketEvent
    .create({
      data: {
        type: "MARKET_SNAPSHOT_REFRESHED",
        source: null,
        payload: {
          city,
          combinationsRefreshed,
          totalActive: totalActiveAcrossCity,
          freshAt: now.toISOString(),
        },
        fingerprint: eventFp,
        correlationId: job.id,
        occurredAt: now,
      },
    })
    .catch((err: Error) => {
      if (!/Unique constraint/i.test(err.message)) throw err;
    });

  console.log(
    `[market:snapshot] city=${city} combinations=${combinationsRefreshed} totalActive=${totalActiveAcrossCity}`,
  );

  return { success: true };
}
