/**
 * Servicio interno para `/api/market/listings/opportunities`.
 *
 * Devuelve una fila por `MarketListing` (no por publicante), con todos los
 * campos pedidos por la UI de captacion: direccion, m2, precio/m2, hab,
 * banos, ciudad, zona, telefono, publicante, portal, foto principal, etc.
 *
 * Filtro espacial opcional por poligono dibujado por el usuario:
 *  - Pre-filtro en SQL via bbox (lat/lng entre minLat/maxLat, minLng/maxLng).
 *  - Post-filtro en JS via `pointInPolygon` para precision.
 *  - Listings sin lat/lng quedan fuera cuando hay poligono activo.
 *
 * Limitaciones conocidas:
 *  - Fotocasa (`source_a`) NO expone lat/lng en el HTML del listado.
 *    Cuando hay poligono, sus listings no aparecen. Sin poligono, si.
 *  - Pisos.com (`source_b`) tiene lat/lng via JSON-LD.
 *  - Idealista (`source_d`) tiene lat/lng extraidos del JSON
 *    `listingMultimediaCarrousels.map.src`.
 *
 * Reglas:
 *  - DTOs estables, jamas exponer modelos Prisma directamente.
 *  - Paginacion por cursor base64 sobre `(lastSeenAt DESC, id DESC)`.
 *  - Auth: el caller se encarga de validar sesion antes de llamar.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  pointInPolygon,
  polygonBbox,
  type Polygon,
} from "./geo/polygon";
import type {
  MarketHousingType,
  MarketListingStatus,
  MarketOperation,
  MarketSource,
} from "./types";

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export interface ListingOpportunityDTO {
  id: string;
  source: MarketSource;
  operation: MarketOperation;
  housingType: MarketHousingType;
  status: MarketListingStatus;
  canonicalUrl: string;

  /** Direccion aproximada cuando el portal la expone. Null si oculta. */
  addressApprox: string | null;
  city: string;
  zone: string | null;
  lat: number | null;
  lng: number | null;

  builtArea: number | null;
  rooms: number | null;
  bathrooms: number | null;
  floor: string | null;

  price: number | null;
  pricePerMeter: number | null;
  currency: string;

  mainImageUrl: string | null;
  /** Todas las URLs de fotos del inmueble (originales del portal). */
  imageUrls: string[];

  /** Descripcion completa de la ficha (rellena tras MARKET_FETCH_DETAIL). */
  description: string | null;
  /** Codigo interno del anunciante en el portal (ej. "VES250414SM"). */
  listingReference: string | null;
  /** Referencia catastral oficial 20 chars (rara, solo cuando aparece). */
  cadastralRef: string | null;
  /** Cuando se enriquecio el detalle por ultima vez. */
  detailFetchedAt: string | null;

  /** Telefono canonico del publicante. Cae de advertiser -> phones[0]. */
  phoneCanonical: string | null;
  advertiserId: string | null;
  advertiserDisplayName: string | null;
  advertiserType: "particular" | "agency" | null;
  inmovillaContactId: string | null;
  assignedComercialId: string | null;
  assignedComercialNombre: string | null;
  assignedAt: string | null;

  captacionStage:
    | "NEW"
    | "PROSPECT_CREATING"
    | "PROSPECT_CREATED"
    | "ENCARGO_ATTACHED"
    | "READY_FOR_PROPERTY"
    | "PROPERTY_CREATING"
    | "PROPERTY_CREATED"
    | "FAILED";
  inmovillaProspectRef: string | null;
  inmovillaPropertyCodOfer: number | null;
  captacionLastError: string | null;
  captacionUpdatedAt: string;

  firstSeenAt: string;
  lastSeenAt: string;
}

export interface ListOpportunityListingsResult {
  items: ListingOpportunityDTO[];
  cursor: string | null;
  meta: {
    /** Total disponible (pre-cursor) tras filtros (excepto poligono que es
     * estimacion: bbox count). Util para mostrar un contador. */
    totalEstimated: number;
    /** Si hubo filtro espacial activo. */
    polygonApplied: boolean;
    /** Lista de sources excluidas por no tener lat/lng (cuando hay polygon). */
    sourcesWithoutCoords: MarketSource[];
    freshAt: string;
  };
}

export interface ListingOpportunityFilters {
  /** Cuando se pasa, se filtra spatially por point-in-polygon. */
  polygon?: Polygon;
  city?: string;
  sources?: MarketSource[];
  operation?: MarketOperation;
  advertiserType?: "particular" | "agency";
  /** Solo con telefono canonico (utiles para captacion). */
  hasPhone?: boolean;
  priceMin?: number;
  priceMax?: number;
  areaMin?: number;
  areaMax?: number;
  roomsMin?: number;
  /** Filtra por `lastSeenAt >= now - sinceHours`. */
  sinceHours?: number;
  cursor?: string;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Cursor
// ---------------------------------------------------------------------------

interface ListingCursor {
  lastSeenAt: string;
  id: string;
}

export function encodeListingCursor(cursor: ListingCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeListingCursor(raw: string): ListingCursor | null {
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

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
/** Sources que actualmente NO traen lat/lng en HTML de listado. */
const SOURCES_WITHOUT_COORDS: MarketSource[] = ["source_a"];

export async function listOpportunityListings(
  filters: ListingOpportunityFilters,
): Promise<ListOpportunityListingsResult> {
  const limit = Math.min(Math.max(1, filters.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const polygon = filters.polygon ?? null;
  const polygonApplied = polygon !== null && polygon.length >= 3;
  const bbox = polygonApplied ? polygonBbox(polygon!) : null;

  const where: Prisma.MarketListingWhereInput = {
    // `unknown` se mantiene visible para no perder oportunidades recientes
    // de portales cuyo estado final aún no se resolvió.
    status: { in: ["active", "unknown"] },
  };
  if (filters.city) {
    // Matching tolerante: cada extractor infiere `city` desde el slug del
    // seed URL y produce variantes ("cordoba", "cordoba_capital",
    // "cordoba capital"). Hacemos `startsWith` case-insensitive para que
    // un único filtro "cordoba" matchee todas las variantes que apuntan a
    // la misma ciudad real, sin necesidad de migrar rows existentes.
    where.city = { startsWith: filters.city, mode: "insensitive" };
  }
  if (filters.sources && filters.sources.length > 0) {
    where.source = { in: filters.sources };
  }
  if (filters.operation) where.operation = filters.operation;
  // Politica nueva (mayo 2026): mostramos AGENCIAS y particulares por igual.
  // Captacion ahora puede contactar agencias (el detail interactivo logra
  // teléfono via click "Ver telefono"). Si el caller quiere filtrar por
  // un tipo concreto, pasa `advertiserType: "particular"` o
  // `advertiserType: "agency"`.
  if (filters.advertiserType) {
    where.advertiserType = filters.advertiserType;
  }
  if (filters.priceMin != null || filters.priceMax != null) {
    const priceFilter: Prisma.IntNullableFilter = {};
    if (filters.priceMin != null) priceFilter.gte = filters.priceMin;
    if (filters.priceMax != null) priceFilter.lte = filters.priceMax;
    where.price = priceFilter;
  }
  if (filters.areaMin != null || filters.areaMax != null) {
    const areaFilter: Prisma.IntNullableFilter = {};
    if (filters.areaMin != null) areaFilter.gte = filters.areaMin;
    if (filters.areaMax != null) areaFilter.lte = filters.areaMax;
    where.builtArea = areaFilter;
  }
  if (filters.roomsMin != null) {
    where.rooms = { gte: filters.roomsMin };
  }
  if (filters.sinceHours != null && filters.sinceHours > 0) {
    const since = new Date(Date.now() - filters.sinceHours * 3600 * 1000);
    where.lastSeenAt = { gte: since };
  }
  if (filters.hasPhone) {
    // Telefono via advertiser (preferido) o phones[0] del listing.
    const phoneOr: Prisma.MarketListingWhereInput[] = [
      { advertiser: { phoneCanonical: { not: null } } },
      { phones: { isEmpty: false } },
    ];
    where.OR = phoneOr;
  }

  // Filtro espacial via bbox (rapido, indexado).
  if (bbox) {
    where.lat = { gte: bbox.minLat, lte: bbox.maxLat };
    where.lng = { gte: bbox.minLng, lte: bbox.maxLng };
  }

  const baseWhere: Prisma.MarketListingWhereInput = { ...where };

  if (filters.cursor) {
    const decoded = decodeListingCursor(filters.cursor);
    if (decoded) {
      const date = new Date(decoded.lastSeenAt);
      const cursorOr: Prisma.MarketListingWhereInput[] = [
        { lastSeenAt: { lt: date } },
        { AND: [{ lastSeenAt: date }, { id: { lt: decoded.id } }] },
      ];
      // where.OR puede haberse setteado por hasPhone arriba; combinar con AND.
      if (where.OR) {
        const existing = Array.isArray(where.OR) ? where.OR : [where.OR];
        const combined: Prisma.MarketListingWhereInput[] = [...existing];
        delete where.OR;
        where.AND = [
          ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
          { OR: combined },
          { OR: cursorOr },
        ];
      } else {
        where.OR = cursorOr;
      }
    }
  }

  // Cuando hay poligono, oversampling para compensar rows que caen fuera del
  // poligono pero dentro del bbox (esquinas del bbox).
  const fetchTake = polygonApplied ? limit * 4 + 1 : limit + 1;

  const [rows, totalEstimated] = await Promise.all([
    prisma.marketListing.findMany({
      where,
      orderBy: [{ lastSeenAt: "desc" }, { id: "desc" }],
      take: fetchTake,
      include: {
        advertiser: {
          select: {
            id: true,
            displayName: true,
            advertiserType: true,
            phoneCanonical: true,
            inmovillaContactId: true,
          },
        },
        assignedComercial: {
          select: {
            id: true,
            nombre: true,
          },
        },
      },
    }),
    prisma.marketListing.count({ where: baseWhere }),
  ]);

  // Post-filter point-in-polygon.
  const passing = polygonApplied
    ? rows.filter(
        (r) =>
          r.lat != null &&
          r.lng != null &&
          pointInPolygon([r.lng, r.lat], polygon!),
      )
    : rows;

  const sliced = passing.slice(0, limit);

  // Si tenemos `limit` resultados y todavia hay mas en `passing`, hay siguiente
  // pagina garantizada. Si tenemos exactamente `limit` y `passing.length === limit`,
  // hay siguiente pagina probable (oversampling no garantiza alcanzar todo).
  const hasMoreInBatch = passing.length > limit;
  const oversamplingExhausted = !polygonApplied
    ? rows.length > limit
    : rows.length === fetchTake;
  const hasMore = hasMoreInBatch || oversamplingExhausted;

  const nextCursor =
    hasMore && sliced.length > 0
      ? encodeListingCursor({
          lastSeenAt: sliced[sliced.length - 1]!.lastSeenAt.toISOString(),
          id: sliced[sliced.length - 1]!.id,
        })
      : null;

  return {
    items: sliced.map(rowToDTO),
    cursor: nextCursor,
    meta: {
      totalEstimated,
      polygonApplied,
      sourcesWithoutCoords: polygonApplied ? SOURCES_WITHOUT_COORDS : [],
      freshAt: new Date().toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ListingRow = Prisma.MarketListingGetPayload<{
  include: {
    advertiser: {
      select: {
        id: true;
        displayName: true;
        advertiserType: true;
        phoneCanonical: true;
        inmovillaContactId: true;
      };
    };
    assignedComercial: {
      select: {
        id: true;
        nombre: true;
      };
    };
  };
}>;

function rowToDTO(row: ListingRow): ListingOpportunityDTO {
  const advertiserType = normalizeAdvertiserType(
    row.advertiser?.advertiserType ?? row.advertiserType,
  );
  const phoneCanonical =
    row.advertiser?.phoneCanonical ?? (row.phones[0] ?? null);
  return {
    id: row.id,
    source: row.source,
    operation: row.operation,
    housingType: row.housingType,
    status: row.status,
    canonicalUrl: row.canonicalUrl,

    addressApprox: row.addressApprox,
    city: row.city,
    zone: row.zone,
    lat: row.lat,
    lng: row.lng,

    builtArea: row.builtArea,
    rooms: row.rooms,
    bathrooms: row.bathrooms,
    floor: row.floor,

    price: row.price,
    pricePerMeter: row.pricePerMeter,
    currency: row.currency,

    mainImageUrl: row.mainImageUrl,
    imageUrls: row.imageUrls ?? [],

    description: row.description,
    listingReference: row.listingReference,
    cadastralRef: row.cadastralRef,
    detailFetchedAt: row.detailFetchedAt ? row.detailFetchedAt.toISOString() : null,

    phoneCanonical,
    advertiserId: row.advertiserId,
    advertiserDisplayName: row.advertiser?.displayName ?? row.advertiserName,
    advertiserType,
    inmovillaContactId: row.advertiser?.inmovillaContactId ?? null,
    assignedComercialId: row.assignedComercialId ?? null,
    assignedComercialNombre: row.assignedComercial?.nombre ?? null,
    assignedAt: row.assignedAt ? row.assignedAt.toISOString() : null,
    captacionStage: row.captacionStage,
    inmovillaProspectRef: row.inmovillaProspectRef ?? null,
    inmovillaPropertyCodOfer: row.inmovillaPropertyCodOfer ?? null,
    captacionLastError: row.captacionLastError ?? null,
    captacionUpdatedAt: row.captacionUpdatedAt.toISOString(),

    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
  };
}

function normalizeAdvertiserType(
  raw: string | null,
): "particular" | "agency" | null {
  if (raw === "particular" || raw === "agency") return raw;
  return null;
}
