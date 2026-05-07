/**
 * Servicio interno para los endpoints `/api/market/*`.
 *
 * Centraliza queries, paginacion cursor y mapeo a DTOs. La regla es
 * **no** exponer modelos Prisma directamente a la API; los DTOs viven
 * en `lib/market/types.ts` y se construyen aqui para mantener un contrato
 * estable.
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import {
  type MarketHousingType,
  type MarketListingDTO,
  type MarketListingStatus,
  type MarketOperation,
  type MarketSnapshotEntryDTO,
  type MarketSource,
  type QualityFlag,
} from "./types";
import { ACTIVE_SOURCES_V1 } from "./source-mapping";

// ---------------------------------------------------------------------------
// DTO mapping
// ---------------------------------------------------------------------------

function rowToDTO(
  row: Awaited<ReturnType<typeof prisma.marketListing.findUnique>>,
): MarketListingDTO | null {
  if (!row) return null;
  return {
    id: row.id,
    source: row.source,
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
    advertiserType: row.advertiserType,
    advertiserName: row.advertiserName,
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

// ---------------------------------------------------------------------------
// Cursor
// ---------------------------------------------------------------------------

interface SearchCursor {
  lastSeenAt: string;
  id: string;
}

export function encodeCursor(cursor: SearchCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCursor(raw: string): SearchCursor | null {
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json);
    if (typeof parsed?.lastSeenAt === "string" && typeof parsed?.id === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SearchListingsQuery {
  city: string;
  housingType?: MarketHousingType;
  operation?: MarketOperation;
  source?: MarketSource;
  status?: MarketListingStatus;
  priceMin?: number;
  priceMax?: number;
  metersMin?: number;
  metersMax?: number;
  roomsMin?: number;
  zone?: string;
  cursor?: string;
  limit?: number;
}

export interface SearchListingsResult {
  items: MarketListingDTO[];
  cursor: string | null;
  meta: {
    total: number;
    freshAt: string;
  };
}

export async function searchListings(
  query: SearchListingsQuery,
): Promise<SearchListingsResult> {
  const limit = Math.min(Math.max(1, query.limit ?? 25), 100);
  const where: Prisma.MarketListingWhereInput = {
    city: query.city,
  };

  if (query.housingType) where.housingType = query.housingType;
  if (query.operation) where.operation = query.operation;
  if (query.source) where.source = query.source;
  if (query.status) where.status = query.status;
  if (query.zone) where.zone = query.zone;

  if (query.priceMin != null || query.priceMax != null) {
    where.price = {};
    if (query.priceMin != null) where.price.gte = query.priceMin;
    if (query.priceMax != null) where.price.lte = query.priceMax;
  }

  if (query.metersMin != null || query.metersMax != null) {
    where.builtArea = {};
    if (query.metersMin != null) where.builtArea.gte = query.metersMin;
    if (query.metersMax != null) where.builtArea.lte = query.metersMax;
  }

  if (query.roomsMin != null) {
    where.rooms = { gte: query.roomsMin };
  }

  // Cursor: paginar por (lastSeenAt DESC, id DESC).
  if (query.cursor) {
    const decoded = decodeCursor(query.cursor);
    if (decoded) {
      const date = new Date(decoded.lastSeenAt);
      where.OR = [
        { lastSeenAt: { lt: date } },
        { AND: [{ lastSeenAt: date }, { id: { lt: decoded.id } }] },
      ];
    }
  }

  const [rows, total] = await Promise.all([
    prisma.marketListing.findMany({
      where,
      orderBy: [{ lastSeenAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    }),
    prisma.marketListing.count({ where: stripCursor(where) }),
  ]);

  const sliced = rows.slice(0, limit);
  const nextCursor =
    rows.length > limit
      ? encodeCursor({
          lastSeenAt: sliced[sliced.length - 1]!.lastSeenAt.toISOString(),
          id: sliced[sliced.length - 1]!.id,
        })
      : null;

  return {
    items: sliced.map((r) => rowToDTO(r)!),
    cursor: nextCursor,
    meta: {
      total,
      freshAt: new Date().toISOString(),
    },
  };
}

function stripCursor(
  where: Prisma.MarketListingWhereInput,
): Prisma.MarketListingWhereInput {
  // Para `total` queremos el count sin filtro de cursor para que la UI
  // pueda mostrar "X resultados" estable al paginar.
  const { OR: _or, ...rest } = where;
  return rest;
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export async function getListingById(
  id: string,
): Promise<MarketListingDTO | null> {
  const row = await prisma.marketListing.findUnique({ where: { id } });
  return rowToDTO(row);
}

export async function getListingTimeline(
  listingId: string,
): Promise<{
  versions: Array<{
    id: string;
    changedFields: string[];
    capturedAt: string;
  }>;
  events: Array<{
    id: string;
    type: string;
    occurredAt: string;
    payload: unknown;
  }>;
}> {
  const [versions, events] = await Promise.all([
    prisma.marketListingVersion.findMany({
      where: { listingId },
      orderBy: { capturedAt: "desc" },
      take: 100,
      select: { id: true, changedFields: true, capturedAt: true },
    }),
    prisma.marketEvent.findMany({
      where: { listingId },
      orderBy: { occurredAt: "desc" },
      take: 100,
      select: { id: true, type: true, occurredAt: true, payload: true },
    }),
  ]);

  return {
    versions: versions.map((v) => ({
      id: v.id,
      changedFields: v.changedFields,
      capturedAt: v.capturedAt.toISOString(),
    })),
    events: events.map((e) => ({
      id: e.id,
      type: e.type,
      occurredAt: e.occurredAt.toISOString(),
      payload: e.payload,
    })),
  };
}

export async function getPropertyById(propertyId: string): Promise<{
  id: string;
  city: string;
  zone: string | null;
  fingerprint: string;
  listingsCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  listings: MarketListingDTO[];
} | null> {
  const property = await prisma.marketProperty.findUnique({
    where: { id: propertyId },
    include: { listings: true },
  });
  if (!property) return null;

  return {
    id: property.id,
    city: property.city,
    zone: property.zone,
    fingerprint: property.fingerprint,
    listingsCount: property.listingsCount,
    firstSeenAt: property.firstSeenAt.toISOString(),
    lastSeenAt: property.lastSeenAt.toISOString(),
    listings: property.listings.map((l) => rowToDTO(l)!),
  };
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

export async function getSnapshotForCity(
  city: string,
): Promise<{ entries: MarketSnapshotEntryDTO[]; freshAt: string | null }> {
  const rows = await prisma.marketSnapshotIndex.findMany({
    where: { city },
    orderBy: [{ housingType: "asc" }, { operation: "asc" }],
  });
  const entries: MarketSnapshotEntryDTO[] = rows.map((r) => ({
    city: r.city,
    housingType: r.housingType,
    operation: r.operation,
    freshAt: r.freshAt.toISOString(),
    totalActive: r.totalActive,
    priceMin: r.priceMin,
    priceMax: r.priceMax,
    priceMedian: r.priceMedian,
    ppmMedian: r.ppmMedian,
  }));
  const freshAt = rows.length > 0
    ? rows.reduce(
        (acc, r) => (acc && acc > r.freshAt ? acc : r.freshAt),
        rows[0]!.freshAt,
      ).toISOString()
    : null;

  return { entries, freshAt };
}

// ---------------------------------------------------------------------------
// Recent events (para panel health)
// ---------------------------------------------------------------------------

export async function listRecentMarketEvents(limit = 20): Promise<
  Array<{
    id: string;
    type: string;
    occurredAt: string;
    listingId: string | null;
    propertyId: string | null;
    source: MarketSource | null;
    payload: unknown;
  }>
> {
  const rows = await prisma.marketEvent.findMany({
    orderBy: { occurredAt: "desc" },
    take: Math.min(Math.max(1, limit), 100),
  });
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    occurredAt: r.occurredAt.toISOString(),
    listingId: r.listingId,
    propertyId: r.propertyId,
    source: r.source,
    payload: r.payload,
  }));
}

export const ACTIVE_SOURCES_FOR_API: readonly MarketSource[] = ACTIVE_SOURCES_V1;
