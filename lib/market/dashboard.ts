/**
 * Servicio del dashboard de inteligencia de mercado.
 *
 * Agrega `MarketListing`, `MarketEvent` y `MarketSnapshotIndex` para producir
 * los KPIs que consume `/platform/market/dashboard`:
 *  - Totales actuales (activos, retirados ultima semana, alta nueva ultima
 *    semana, rebajas relevantes ultima semana).
 *  - Por zona (precio mediano, eur/m² mediano, n activos, delta vs 30d).
 *  - Por tipologia (mediana eur/m², n).
 *  - Evolucion temporal eur/m² (30 dias).
 *  - Top advertisers por inventario activo.
 *
 * Decisiones MVP:
 *  - Filtro por ciudad (default `cordoba`); resto de cobertura escalable
 *    cuando aterricen seeds de otras ciudades.
 *  - Histórico diario derivado de `MarketSnapshotIndex.freshAt` agrupado
 *    por dia. Si no hay rows historicos suficientes, devuelve serie corta.
 *  - Rebajas relevantes = `MARKET_LISTING_PRICE_CHANGED` con
 *    `payload.deltaPct <= -0.03` (caida >= 3%).
 *
 * Calculos de mediana: usar Postgres `percentile_cont` via $queryRaw para
 * que escale con volumen sin cargar todo el set en memoria.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { MarketHousingType } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DashboardKPIs {
  totalActive: number;
  newLast7d: number;
  removedLast7d: number;
  priceDropsLast7d: number;
}

export interface ZoneAggregate {
  zone: string;
  totalActive: number;
  priceMedian: number | null;
  ppmMedian: number | null;
  /** Diferencia % en eur/m² mediano respecto a hace 30 dias (positivo = subio). */
  ppmDeltaPct30d: number | null;
}

export interface HousingAggregate {
  housingType: MarketHousingType;
  totalActive: number;
  priceMedian: number | null;
  ppmMedian: number | null;
}

export interface PpmDailyPoint {
  /** YYYY-MM-DD UTC. */
  day: string;
  ppmMedian: number | null;
  totalActive: number;
}

export interface TopAdvertiserEntry {
  advertiserId: string;
  displayName: string | null;
  advertiserType: string | null;
  phoneCanonical: string | null;
  inmovillaContactId: string | null;
  activeListings: number;
}

export interface DashboardData {
  city: string;
  generatedAt: string;
  kpis: DashboardKPIs;
  zones: ZoneAggregate[];
  housingTypes: HousingAggregate[];
  ppmDaily: PpmDailyPoint[];
  topAdvertisers: TopAdvertiserEntry[];
}

// ---------------------------------------------------------------------------
// Aggregator
// ---------------------------------------------------------------------------

const DEFAULT_DAYS = 30;
const PRICE_DROP_THRESHOLD_PCT = -0.03;

export async function getDashboardData(
  city: string,
  daysParam = DEFAULT_DAYS,
): Promise<DashboardData> {
  const days = Math.min(Math.max(7, daysParam), 90);
  const now = new Date();
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const since30d = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const cityFilter = city.trim();

  const cityWhere = Prisma.sql`AND city ILIKE ${cityFilter + "%"}`;

  const [
    kpis,
    zones,
    housingTypes,
    ppmDaily,
    topAdvertisers,
  ] = await Promise.all([
    aggregateKpis(cityWhere, since7d, cityFilter),
    aggregateZones(cityFilter, since30d),
    aggregateHousingTypes(cityFilter),
    aggregatePpmDaily(cityFilter, days),
    aggregateTopAdvertisers(cityFilter),
  ]);

  return {
    city: cityFilter,
    generatedAt: now.toISOString(),
    kpis,
    zones,
    housingTypes,
    ppmDaily,
    topAdvertisers,
  };
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

async function aggregateKpis(
  cityWhere: Prisma.Sql,
  since7d: Date,
  cityFilter: string,
): Promise<DashboardKPIs> {
  const totalActive = await prisma.marketListing.count({
    where: {
      city: { startsWith: cityFilter, mode: "insensitive" },
      status: { in: ["active", "unknown"] },
    },
  });

  const newLast7d = await prisma.marketListing.count({
    where: {
      city: { startsWith: cityFilter, mode: "insensitive" },
      firstSeenAt: { gte: since7d },
    },
  });

  const removedLast7d = await prisma.marketEvent.count({
    where: {
      type: "MARKET_LISTING_REMOVED",
      occurredAt: { gte: since7d },
    },
  });

  // priceDropsLast7d = MARKET_LISTING_PRICE_CHANGED en los ultimos 7d
  // donde payload.deltaPct <= -0.03. payload es JSON, usamos $queryRaw.
  const priceDropsRows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint as count
    FROM market_events e
    LEFT JOIN market_listings l ON l.id = e."listingId"
    WHERE e.type = 'MARKET_LISTING_PRICE_CHANGED'
      AND e."occurredAt" >= ${since7d}
      AND ((e.payload ->> 'deltaPct')::float) <= ${PRICE_DROP_THRESHOLD_PCT}
      AND (l.city IS NULL OR l.city ILIKE ${cityFilter + "%"})
  `;
  const priceDropsLast7d = Number(priceDropsRows[0]?.count ?? 0);

  return { totalActive, newLast7d, removedLast7d, priceDropsLast7d };
}

// ---------------------------------------------------------------------------
// Zonas (con delta 30d)
// ---------------------------------------------------------------------------

interface RawZoneRow {
  zone: string | null;
  active: bigint;
  price_median: number | null;
  ppm_median: number | null;
}

async function aggregateZones(
  cityFilter: string,
  since30d: Date,
): Promise<ZoneAggregate[]> {
  const cityPattern = cityFilter + "%";

  const current = await prisma.$queryRaw<RawZoneRow[]>`
    SELECT
      COALESCE(zone, '(sin zona)') as zone,
      COUNT(*)::bigint as active,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY price)::float as price_median,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY "pricePerMeter")::float as ppm_median
    FROM market_listings
    WHERE city ILIKE ${cityPattern}
      AND status IN ('active', 'unknown')
    GROUP BY COALESCE(zone, '(sin zona)')
    ORDER BY active DESC
    LIMIT 50
  `;

  const past = await prisma.$queryRaw<RawZoneRow[]>`
    SELECT
      COALESCE(zone, '(sin zona)') as zone,
      COUNT(*)::bigint as active,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY price)::float as price_median,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY "pricePerMeter")::float as ppm_median
    FROM market_listings
    WHERE city ILIKE ${cityPattern}
      AND "firstSeenAt" <= ${since30d}
      AND status IN ('active', 'unknown')
    GROUP BY COALESCE(zone, '(sin zona)')
  `;
  const pastByZone = new Map<string, RawZoneRow>();
  for (const row of past) pastByZone.set(row.zone ?? "(sin zona)", row);

  return current.map<ZoneAggregate>((row) => {
    const zone = row.zone ?? "(sin zona)";
    const pastRow = pastByZone.get(zone);
    const ppmDeltaPct30d =
      pastRow?.ppm_median != null &&
      row.ppm_median != null &&
      pastRow.ppm_median > 0
        ? (row.ppm_median - pastRow.ppm_median) / pastRow.ppm_median
        : null;
    return {
      zone,
      totalActive: Number(row.active),
      priceMedian: row.price_median,
      ppmMedian: row.ppm_median,
      ppmDeltaPct30d,
    };
  });
}

// ---------------------------------------------------------------------------
// Tipologia
// ---------------------------------------------------------------------------

interface RawHousingRow {
  housingType: MarketHousingType;
  active: bigint;
  price_median: number | null;
  ppm_median: number | null;
}

async function aggregateHousingTypes(
  cityFilter: string,
): Promise<HousingAggregate[]> {
  const cityPattern = cityFilter + "%";
  const rows = await prisma.$queryRaw<RawHousingRow[]>`
    SELECT
      "housingType" as "housingType",
      COUNT(*)::bigint as active,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY price)::float as price_median,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY "pricePerMeter")::float as ppm_median
    FROM market_listings
    WHERE city ILIKE ${cityPattern}
      AND status IN ('active', 'unknown')
    GROUP BY "housingType"
    ORDER BY active DESC
  `;

  return rows.map<HousingAggregate>((row) => ({
    housingType: row.housingType,
    totalActive: Number(row.active),
    priceMedian: row.price_median,
    ppmMedian: row.ppm_median,
  }));
}

// ---------------------------------------------------------------------------
// Evolucion temporal (eur/m² mediano por dia)
// ---------------------------------------------------------------------------

interface RawDailyRow {
  day: Date;
  ppm_median: number | null;
  total_active: bigint;
}

async function aggregatePpmDaily(
  cityFilter: string,
  days: number,
): Promise<PpmDailyPoint[]> {
  const cityPattern = cityFilter + "%";
  // MarketSnapshotIndex se persiste/refresca; agrupamos por dia.
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await prisma.$queryRaw<RawDailyRow[]>`
    SELECT
      DATE_TRUNC('day', "freshAt") as day,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY "ppmMedian")::float as ppm_median,
      SUM("totalActive")::bigint as total_active
    FROM market_snapshot_index
    WHERE city ILIKE ${cityPattern}
      AND "freshAt" >= ${since}
    GROUP BY DATE_TRUNC('day', "freshAt")
    ORDER BY day ASC
  `;

  return rows.map<PpmDailyPoint>((row) => ({
    day: row.day.toISOString().slice(0, 10),
    ppmMedian: row.ppm_median,
    totalActive: Number(row.total_active),
  }));
}

// ---------------------------------------------------------------------------
// Top advertisers
// ---------------------------------------------------------------------------

async function aggregateTopAdvertisers(
  cityFilter: string,
): Promise<TopAdvertiserEntry[]> {
  const cityPattern = cityFilter + "%";

  // Agrupamos por advertiserId; preferimos contar listings activos en
  // la ciudad. JOIN con market_advertisers para traer phoneCanonical y demas.
  const rows = await prisma.$queryRaw<
    {
      advertiserId: string;
      active: bigint;
      displayName: string | null;
      advertiserType: string | null;
      phoneCanonical: string | null;
      inmovillaContactId: string | null;
    }[]
  >`
    SELECT
      l."advertiserId" as "advertiserId",
      COUNT(*)::bigint as active,
      a."displayName" as "displayName",
      a."advertiserType" as "advertiserType",
      a."phoneCanonical" as "phoneCanonical",
      a."inmovillaContactId" as "inmovillaContactId"
    FROM market_listings l
    INNER JOIN market_advertisers a ON a.id = l."advertiserId"
    WHERE l.city ILIKE ${cityPattern}
      AND l.status IN ('active', 'unknown')
      AND l."advertiserId" IS NOT NULL
    GROUP BY l."advertiserId", a."displayName", a."advertiserType", a."phoneCanonical", a."inmovillaContactId"
    ORDER BY active DESC
    LIMIT 25
  `;

  return rows.map<TopAdvertiserEntry>((row) => ({
    advertiserId: row.advertiserId,
    displayName: row.displayName,
    advertiserType: row.advertiserType,
    phoneCanonical: row.phoneCanonical,
    inmovillaContactId: row.inmovillaContactId,
    activeListings: Number(row.active),
  }));
}
