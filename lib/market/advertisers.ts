/**
 * Servicio interno para los endpoints `/api/market/advertisers/*`.
 *
 * Responsable de listar `MarketAdvertiser` (oportunidades de captacion)
 * y de devolver el detalle del publicante con sus `MarketListing`
 * agrupados por portal.
 *
 * Reglas:
 *  - DTOs estables, jamas exponer modelos Prisma directamente.
 *  - Paginacion por cursor base64 sobre `(lastSeenAt DESC, id DESC)`.
 *  - El "primary listing" es el mas reciente (por `lastSeenAt`) entre
 *    todos los listings vinculados al advertiser.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { MarketSource } from "./types";

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export interface AdvertiserPrimaryListing {
  listingId: string;
  source: MarketSource;
  canonicalUrl: string;
  city: string;
  zone: string | null;
  operation: string;
  housingType: string;
  price: number | null;
  builtArea: number | null;
  rooms: number | null;
  mainImageUrl: string | null;
  lastSeenAt: string;
}

export interface AdvertiserOpportunityDTO {
  id: string;
  displayName: string | null;
  advertiserType: "particular" | "agency" | null;
  phoneCanonical: string | null;
  listingsCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  inmovillaContactId: string | null;
  primary: AdvertiserPrimaryListing | null;
}

export interface AdvertiserDetailListingDTO {
  id: string;
  source: MarketSource;
  canonicalUrl: string;
  externalId: string;
  city: string;
  zone: string | null;
  operation: string;
  housingType: string;
  price: number | null;
  builtArea: number | null;
  rooms: number | null;
  bathrooms: number | null;
  mainImageUrl: string | null;
  imageUrls: string[];
  status: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface AdvertiserDetailDTO extends AdvertiserOpportunityDTO {
  bySource: Record<MarketSource, AdvertiserDetailListingDTO[]>;
  totalListings: number;
}

// ---------------------------------------------------------------------------
// Cursor
// ---------------------------------------------------------------------------

interface AdvertiserCursor {
  lastSeenAt: string;
  id: string;
}

export function encodeAdvertiserCursor(cursor: AdvertiserCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeAdvertiserCursor(raw: string): AdvertiserCursor | null {
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json);
    if (
      parsed &&
      typeof parsed.lastSeenAt === "string" &&
      typeof parsed.id === "string"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export interface ListAdvertisersQuery {
  city?: string;
  advertiserType?: "particular" | "agency";
  /** Si `true`, solo advertisers con `phoneCanonical` no nulo. */
  hasPhone?: boolean;
  /** Filtra por `lastSeenAt >= now - sinceHours`. */
  sinceHours?: number;
  cursor?: string;
  limit?: number;
}

export interface ListAdvertisersResult {
  items: AdvertiserOpportunityDTO[];
  cursor: string | null;
  meta: {
    total: number;
    freshAt: string;
  };
}

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 25;

export async function listAdvertisers(
  query: ListAdvertisersQuery,
): Promise<ListAdvertisersResult> {
  const limit = Math.min(Math.max(1, query.limit ?? DEFAULT_LIMIT), MAX_LIMIT);

  const where: Prisma.MarketAdvertiserWhereInput = {};
  if (query.advertiserType) where.advertiserType = query.advertiserType;
  if (query.hasPhone) where.phoneCanonical = { not: null };

  if (query.sinceHours != null && query.sinceHours > 0) {
    const since = new Date(Date.now() - query.sinceHours * 3600 * 1000);
    where.lastSeenAt = { gte: since };
  }

  // City se aplica via existencia de un listing con esa ciudad. Asi
  // mantenemos la consulta sobre `MarketAdvertiser` y no replicamos
  // ciudad en la fila advertiser (no es campo del modelo).
  if (query.city) {
    where.listings = { some: { city: query.city } };
  }

  // Paginacion (lastSeenAt DESC, id DESC)
  const baseWhere: Prisma.MarketAdvertiserWhereInput = { ...where };
  if (query.cursor) {
    const decoded = decodeAdvertiserCursor(query.cursor);
    if (decoded) {
      const date = new Date(decoded.lastSeenAt);
      where.OR = [
        { lastSeenAt: { lt: date } },
        { AND: [{ lastSeenAt: date }, { id: { lt: decoded.id } }] },
      ];
    }
  }

  const [rows, total] = await Promise.all([
    prisma.marketAdvertiser.findMany({
      where,
      orderBy: [{ lastSeenAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      include: {
        listings: {
          orderBy: { lastSeenAt: "desc" },
          take: 1,
        },
      },
    }),
    prisma.marketAdvertiser.count({ where: baseWhere }),
  ]);

  const sliced = rows.slice(0, limit);
  const nextCursor =
    rows.length > limit
      ? encodeAdvertiserCursor({
          lastSeenAt: sliced[sliced.length - 1]!.lastSeenAt.toISOString(),
          id: sliced[sliced.length - 1]!.id,
        })
      : null;

  return {
    items: sliced.map((r) => rowToOpportunityDTO(r)),
    cursor: nextCursor,
    meta: {
      total,
      freshAt: new Date().toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export async function getAdvertiserDetail(
  id: string,
): Promise<AdvertiserDetailDTO | null> {
  const row = await prisma.marketAdvertiser.findUnique({
    where: { id },
    include: {
      listings: {
        orderBy: { lastSeenAt: "desc" },
      },
    },
  });
  if (!row) return null;

  const opportunity = rowToOpportunityDTO(row);

  const bySource = {} as Record<MarketSource, AdvertiserDetailListingDTO[]>;
  for (const listing of row.listings) {
    const dto: AdvertiserDetailListingDTO = {
      id: listing.id,
      source: listing.source,
      canonicalUrl: listing.canonicalUrl,
      externalId: listing.externalId,
      city: listing.city,
      zone: listing.zone,
      operation: listing.operation,
      housingType: listing.housingType,
      price: listing.price,
      builtArea: listing.builtArea,
      rooms: listing.rooms,
      bathrooms: listing.bathrooms,
      mainImageUrl: listing.mainImageUrl,
      imageUrls: listing.imageUrls,
      status: listing.status,
      firstSeenAt: listing.firstSeenAt.toISOString(),
      lastSeenAt: listing.lastSeenAt.toISOString(),
    };
    if (!bySource[dto.source]) bySource[dto.source] = [];
    bySource[dto.source].push(dto);
  }

  return {
    ...opportunity,
    bySource,
    totalListings: row.listings.length,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type AdvertiserWithListings = Prisma.MarketAdvertiserGetPayload<{
  include: { listings: { take: 1 } };
}>;

function rowToOpportunityDTO(
  row: AdvertiserWithListings,
): AdvertiserOpportunityDTO {
  const primary = row.listings[0]
    ? listingToPrimaryDTO(row.listings[0])
    : null;

  return {
    id: row.id,
    displayName: row.displayName,
    advertiserType: normalizeAdvertiserType(row.advertiserType),
    phoneCanonical: row.phoneCanonical,
    listingsCount: row.listingsCount,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    inmovillaContactId: row.inmovillaContactId,
    primary,
  };
}

function listingToPrimaryDTO(
  listing: AdvertiserWithListings["listings"][number],
): AdvertiserPrimaryListing {
  return {
    listingId: listing.id,
    source: listing.source,
    canonicalUrl: listing.canonicalUrl,
    city: listing.city,
    zone: listing.zone,
    operation: listing.operation,
    housingType: listing.housingType,
    price: listing.price,
    builtArea: listing.builtArea,
    rooms: listing.rooms,
    mainImageUrl: listing.mainImageUrl,
    lastSeenAt: listing.lastSeenAt.toISOString(),
  };
}

function normalizeAdvertiserType(
  raw: string | null,
): "particular" | "agency" | null {
  if (raw === "particular" || raw === "agency") return raw;
  return null;
}
