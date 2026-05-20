/**
 * Servicio interno para `/api/market/properties/*`.
 *
 * A diferencia de `lib/market/listings.ts` (que devuelve 1 fila por
 * `MarketListing`), este modulo opera a nivel de `MarketProperty` (1 inmueble
 * fisico = N anuncios cross-portal). Es la base del producto "Statefox
 * in-house": cuando el mismo piso aparece en Idealista + Fotocasa + Pisos.com,
 * la UI debe ver una sola fila con badges de los 3 portales.
 *
 * Decisiones MVP (ver docs/core-sistema-mercado.md):
 *  - Listings con `propertyId = null` (no clusterizados aun, score < 0.70 o
 *    huerfanos) se exponen como "property virtual": id = listingId, portals
 *    de un solo elemento. Esto evita perderlos en la UI mientras el pipeline
 *    de identidad sigue procesando.
 *  - El representativeListing es el que tenga mayor `qualityScore`; en empate,
 *    el mas reciente (`lastSeenAt`).
 *  - Los rollups (minPrice, maxPrice, priceVariance, captacionStage) se
 *    calculan en memoria sobre los listings agrupados.
 *
 * Filtros, paginacion y polygon spatial: misma semantica que
 * `listOpportunityListings`. Para no perder cobertura, primero buscamos los
 * listings que matchean los filtros (igual que listings.ts) y despues los
 * agrupamos por propertyId. La paginacion sigue siendo por (lastSeenAt, id)
 * del listing representativo, para mantener orden estable.
 */

import type { MarketCaptacionStage, Prisma } from "@prisma/client";
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
import {
  getCaptacionTagsByListingIds,
  type CaptacionTag,
} from "./captacion-tags";

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export interface PropertyPortalEntry {
  source: MarketSource;
  listingId: string;
  externalId: string;
  canonicalUrl: string;
  price: number | null;
  pricePerMeter: number | null;
  status: MarketListingStatus;
  mainImageUrl: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  /** Codigo interno del anunciante en el portal cuando esta. */
  listingReference: string | null;
}

export interface PropertyClusterDTO {
  /** id de MarketProperty real, o "virtual:{listingId}" cuando no esta clusterizado. */
  propertyId: string;
  /** true si todos los portals coinciden en un MarketProperty real. */
  clustered: boolean;
  /**
   * id del MarketListing usado como representativo (mejor qualityScore;
   * empate -> mas reciente). Es el listing donde residen los campos de
   * captacion (`captacionStage`, `assignedComercialId`, etc.) que la UI
   * mutara con los endpoints de assignment / inmovilla-prospect / promote.
   * Mantener separado de `propertyId` para no confundir la mutacion de
   * captacion (por listing) con la lectura de cluster (por property).
   */
  representativeListingId: string;

  // Resumen del inmueble (rollup desde el representativeListing)
  housingType: MarketHousingType;
  operation: MarketOperation;
  city: string;
  zone: string | null;
  addressApprox: string | null;
  lat: number | null;
  lng: number | null;
  builtArea: number | null;
  rooms: number | null;
  bathrooms: number | null;
  floor: string | null;

  mainImageUrl: string | null;
  /** Galeria deduplicada cross-portal (preferimos la del representativeListing). */
  imageUrls: string[];

  // Rollups cross-portal
  portals: PropertyPortalEntry[];
  /** Precio del representativeListing. */
  representativePrice: number | null;
  representativePricePerMeter: number | null;
  /** Min y max de precio observado entre los portals. */
  minPrice: number | null;
  maxPrice: number | null;
  /** Diferencia absoluta entre max y min cuando ambos existen. */
  priceSpreadAbs: number | null;
  /** (max - min) / min cuando ambos existen y min > 0; util para ordenar oportunidades. */
  priceSpreadPct: number | null;

  // Capa comercial (rollup desde el listing canonico mas reciente con datos)
  description: string | null;
  listingReference: string | null;
  cadastralRef: string | null;
  detailFetchedAt: string | null;
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
  captacionTag: CaptacionTag | null;
  inmovillaProspectRef: string | null;
  inmovillaPropertyCodOfer: number | null;
  captacionLastError: string | null;
  captacionUpdatedAt: string;

  // Marcas temporales del cluster
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface PropertyClusterFilters {
  polygon?: Polygon;
  city?: string;
  sources?: MarketSource[];
  operation?: MarketOperation;
  captacionStages?: MarketCaptacionStage[];
  prospectSentByUserId?: string;
  advertiserType?: "particular" | "agency";
  hasPhone?: boolean;
  priceMin?: number;
  priceMax?: number;
  areaMin?: number;
  areaMax?: number;
  roomsMin?: number;
  sinceHours?: number;
  cursor?: string;
  limit?: number;
}

export interface ListPropertyClustersResult {
  items: PropertyClusterDTO[];
  cursor: string | null;
  meta: {
    /** Total estimado de listings (no de clusters) que matchean los filtros. */
    totalEstimated: number;
    polygonApplied: boolean;
    sourcesWithoutCoords: MarketSource[];
    freshAt: string;
  };
}

// ---------------------------------------------------------------------------
// Cursor (mismo formato que listings.ts para reuso de codigo y compat)
// ---------------------------------------------------------------------------

interface ClusterCursor {
  lastSeenAt: string;
  id: string;
}

function encodeClusterCursor(cursor: ClusterCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeClusterCursor(raw: string): ClusterCursor | null {
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
const SOURCES_WITHOUT_COORDS: MarketSource[] = ["source_a"];
/**
 * Oversampling necesario para que despues de agrupar por propertyId todavia
 * tengamos `limit` clusters. Si un cluster reune 3 listings, perdimos 2 filas
 * comparado con el listado plano. 3x es conservador para datos reales.
 */
const CLUSTER_OVERSAMPLING = 3;

export async function listPropertyClusters(
  filters: PropertyClusterFilters,
): Promise<ListPropertyClustersResult> {
  const limit = Math.min(Math.max(1, filters.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const polygon = filters.polygon ?? null;
  const polygonApplied = polygon !== null && polygon.length >= 3;
  const bbox = polygonApplied ? polygonBbox(polygon!) : null;

  const where: Prisma.MarketListingWhereInput = {
    status: { in: ["active", "unknown"] },
  };
  if (filters.city) {
    where.city = { startsWith: filters.city, mode: "insensitive" };
  }
  if (filters.sources && filters.sources.length > 0) {
    where.source = { in: filters.sources };
  }
  if (filters.operation) where.operation = filters.operation;
  if (filters.captacionStages && filters.captacionStages.length > 0) {
    where.captacionStage = { in: filters.captacionStages };
  }
  if (filters.prospectSentByUserId) {
    where.captacionProspectSentByUserId = filters.prospectSentByUserId;
  }
  if (filters.advertiserType) where.advertiserType = filters.advertiserType;

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
    const phoneOr: Prisma.MarketListingWhereInput[] = [
      { advertiser: { phoneCanonical: { not: null } } },
      { phones: { isEmpty: false } },
    ];
    where.OR = phoneOr;
  }

  if (bbox) {
    where.lat = { gte: bbox.minLat, lte: bbox.maxLat };
    where.lng = { gte: bbox.minLng, lte: bbox.maxLng };
  }

  const baseWhere: Prisma.MarketListingWhereInput = { ...where };

  if (filters.cursor) {
    const decoded = decodeClusterCursor(filters.cursor);
    if (decoded) {
      const date = new Date(decoded.lastSeenAt);
      const cursorOr: Prisma.MarketListingWhereInput[] = [
        { lastSeenAt: { lt: date } },
        { AND: [{ lastSeenAt: date }, { id: { lt: decoded.id } }] },
      ];
      if (where.OR) {
        const existing = Array.isArray(where.OR) ? where.OR : [where.OR];
        const combined: Prisma.MarketListingWhereInput[] = [...existing];
        delete where.OR;
        where.AND = [
          ...(Array.isArray(where.AND)
            ? where.AND
            : where.AND
              ? [where.AND]
              : []),
          { OR: combined },
          { OR: cursorOr },
        ];
      } else {
        where.OR = cursorOr;
      }
    }
  }

  // Oversampling: cogemos N veces mas listings de los que necesitamos en
  // clusters. Despues agrupamos y truncamos al `limit` real.
  const oversampling = polygonApplied
    ? CLUSTER_OVERSAMPLING * 4
    : CLUSTER_OVERSAMPLING;
  const fetchTake = limit * oversampling + 1;

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
          select: { id: true, nombre: true },
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

  // Agrupar por propertyId. Listings huerfanos -> property virtual.
  const groupedById = new Map<string, ListingRow[]>();
  for (const row of passing) {
    const groupKey = row.propertyId ?? `virtual:${row.id}`;
    const bucket = groupedById.get(groupKey);
    if (bucket) bucket.push(row);
    else groupedById.set(groupKey, [row]);
  }

  // Construir clusters preservando el orden del primer listing visto en cada
  // grupo (que respeta el ORDER BY lastSeenAt DESC, id DESC).
  const clusters: PropertyClusterDTO[] = [];
  const seenGroupKeys = new Set<string>();
  for (const row of passing) {
    const groupKey = row.propertyId ?? `virtual:${row.id}`;
    if (seenGroupKeys.has(groupKey)) continue;
    seenGroupKeys.add(groupKey);
    const bucket = groupedById.get(groupKey)!;
    clusters.push(buildClusterDTO(groupKey, bucket));
    if (clusters.length >= limit + 1) break;
  }

  const sliced = clusters.slice(0, limit);
  const hasMore = clusters.length > limit;

  const captacionTagsByListingId = await getCaptacionTagsByListingIds(
    sliced.map((cluster) => cluster.representativeListingId),
  );
  const enriched = sliced.map((cluster) => ({
    ...cluster,
    captacionTag:
      captacionTagsByListingId.get(cluster.representativeListingId) ?? null,
  }));

  const nextCursor =
    hasMore && enriched.length > 0
      ? encodeClusterCursor({
          lastSeenAt: enriched[enriched.length - 1]!.lastSeenAt,
          // Cursor por el listing representativo del ultimo cluster, que es
          // por construccion el orderBy anterior.
          id: enriched[enriched.length - 1]!.portals[0]!.listingId,
        })
      : null;

  return {
    items: enriched,
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
// Build cluster DTO
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
      select: { id: true; nombre: true };
    };
  };
}>;

function buildClusterDTO(
  groupKey: string,
  listings: ListingRow[],
): PropertyClusterDTO {
  // Representative: mejor qualityScore; empate -> mas reciente lastSeenAt.
  const representative = pickRepresentative(listings);

  const portals: PropertyPortalEntry[] = listings
    .slice()
    .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
    .map((l) => ({
      source: l.source,
      listingId: l.id,
      externalId: l.externalId,
      canonicalUrl: l.canonicalUrl,
      price: l.price,
      pricePerMeter: l.pricePerMeter,
      status: l.status,
      mainImageUrl: l.mainImageUrl,
      firstSeenAt: l.firstSeenAt.toISOString(),
      lastSeenAt: l.lastSeenAt.toISOString(),
      listingReference: l.listingReference,
    }));

  const prices = portals
    .map((p) => p.price)
    .filter((p): p is number => p != null && p > 0);
  const minPrice = prices.length > 0 ? Math.min(...prices) : null;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : null;
  const priceSpreadAbs =
    minPrice != null && maxPrice != null && maxPrice !== minPrice
      ? maxPrice - minPrice
      : null;
  const priceSpreadPct =
    minPrice != null && maxPrice != null && minPrice > 0
      ? (maxPrice - minPrice) / minPrice
      : null;

  // Galeria deduplicada cross-portal: prioriza representative, despues otros.
  const imageUrls = dedupePreservingOrder([
    ...(representative.imageUrls ?? []),
    ...listings.flatMap((l) => l.imageUrls ?? []),
  ]);

  // Description / detail fields: el primero (orden de quality) que los tenga.
  const withDescription =
    listings.find((l) => l.description && l.description.trim().length > 0) ??
    representative;
  const withDetail = listings.find((l) => l.detailFetchedAt != null) ?? null;
  const withReference =
    listings.find((l) => l.listingReference && l.listingReference.trim()) ??
    representative;
  const withCadastral =
    listings.find((l) => l.cadastralRef && l.cadastralRef.trim()) ?? null;

  const advertiserType = normalizeAdvertiserType(
    representative.advertiser?.advertiserType ?? representative.advertiserType,
  );
  const phoneCanonical =
    representative.advertiser?.phoneCanonical ??
    representative.phones[0] ??
    listings.flatMap((l) => l.phones).find((p) => p && p.length > 0) ??
    null;

  const firstSeenAt = listings.reduce(
    (acc, l) => (acc < l.firstSeenAt ? acc : l.firstSeenAt),
    listings[0]!.firstSeenAt,
  );
  const lastSeenAt = listings.reduce(
    (acc, l) => (acc > l.lastSeenAt ? acc : l.lastSeenAt),
    listings[0]!.lastSeenAt,
  );

  const clustered = !groupKey.startsWith("virtual:");

  return {
    propertyId: groupKey,
    clustered,
    representativeListingId: representative.id,
    housingType: representative.housingType,
    operation: representative.operation,
    city: representative.city,
    zone: representative.zone,
    addressApprox: representative.addressApprox,
    lat: representative.lat,
    lng: representative.lng,
    builtArea: representative.builtArea,
    rooms: representative.rooms,
    bathrooms: representative.bathrooms,
    floor: representative.floor,

    mainImageUrl: representative.mainImageUrl ?? imageUrls[0] ?? null,
    imageUrls,

    portals,
    representativePrice: representative.price,
    representativePricePerMeter: representative.pricePerMeter,
    minPrice,
    maxPrice,
    priceSpreadAbs,
    priceSpreadPct,

    description: withDescription.description,
    listingReference: withReference.listingReference,
    cadastralRef: withCadastral?.cadastralRef ?? null,
    detailFetchedAt: withDetail?.detailFetchedAt
      ? withDetail.detailFetchedAt.toISOString()
      : null,
    phoneCanonical,
    advertiserId: representative.advertiserId,
    advertiserDisplayName:
      representative.advertiser?.displayName ?? representative.advertiserName,
    advertiserType,
    inmovillaContactId: representative.advertiser?.inmovillaContactId ?? null,
    assignedComercialId: representative.assignedComercialId ?? null,
    assignedComercialNombre:
      representative.assignedComercial?.nombre ?? null,
    assignedAt: representative.assignedAt
      ? representative.assignedAt.toISOString()
      : null,

    captacionStage: representative.captacionStage,
    captacionTag: null,
    inmovillaProspectRef: representative.inmovillaProspectRef ?? null,
    inmovillaPropertyCodOfer: representative.inmovillaPropertyCodOfer ?? null,
    captacionLastError: representative.captacionLastError ?? null,
    captacionUpdatedAt: representative.captacionUpdatedAt.toISOString(),

    firstSeenAt: firstSeenAt.toISOString(),
    lastSeenAt: lastSeenAt.toISOString(),
  };
}

function pickRepresentative(listings: ListingRow[]): ListingRow {
  if (listings.length === 1) return listings[0]!;
  let best = listings[0]!;
  for (const l of listings.slice(1)) {
    if (l.qualityScore > best.qualityScore) {
      best = l;
      continue;
    }
    if (
      l.qualityScore === best.qualityScore &&
      l.lastSeenAt.getTime() > best.lastSeenAt.getTime()
    ) {
      best = l;
    }
  }
  return best;
}

function dedupePreservingOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function normalizeAdvertiserType(
  raw: string | null,
): "particular" | "agency" | null {
  if (raw === "particular" || raw === "agency") return raw;
  return null;
}

// ---------------------------------------------------------------------------
// Detalle (ficha)
// ---------------------------------------------------------------------------

/**
 * Devuelve el cluster completo de una `MarketProperty` por su id.
 * Si `id` empieza con `virtual:`, busca por `MarketListing.id` y devuelve un
 * cluster de un solo portal (sin clusterizar).
 */
export async function getPropertyCluster(
  id: string,
): Promise<PropertyClusterDTO | null> {
  if (id.startsWith("virtual:")) {
    const listingId = id.slice("virtual:".length);
    const row = await prisma.marketListing.findUnique({
      where: { id: listingId },
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
        assignedComercial: { select: { id: true, nombre: true } },
      },
    });
    if (!row) return null;
    return buildClusterDTO(`virtual:${row.id}`, [row]);
  }

  const property = await prisma.marketProperty.findUnique({
    where: { id },
    include: {
      listings: {
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
          assignedComercial: { select: { id: true, nombre: true } },
        },
      },
    },
  });
  if (!property || property.listings.length === 0) return null;
  return buildClusterDTO(property.id, property.listings);
}

/**
 * Resuelve el cluster al que pertenece un listing concreto. Si el listing
 * tiene `propertyId`, devuelve el cluster real; si no, una "virtual:".
 */
export async function getClusterForListingId(
  listingId: string,
): Promise<PropertyClusterDTO | null> {
  const listing = await prisma.marketListing.findUnique({
    where: { id: listingId },
    select: { id: true, propertyId: true },
  });
  if (!listing) return null;
  if (listing.propertyId) return getPropertyCluster(listing.propertyId);
  return getPropertyCluster(`virtual:${listing.id}`);
}

// ---------------------------------------------------------------------------
// Timeline (cluster)
// ---------------------------------------------------------------------------

export interface ClusterTimelineEntry {
  id: string;
  kind: "version" | "event";
  occurredAt: string;
  listingId: string;
  source: MarketSource | null;
  /** Para "version": campos cambiados. Para "event": tipo de evento. */
  label: string;
  payload: unknown;
}

export async function getPropertyClusterTimeline(
  propertyId: string,
  limit = 100,
): Promise<ClusterTimelineEntry[]> {
  if (propertyId.startsWith("virtual:")) {
    const listingId = propertyId.slice("virtual:".length);
    return getListingTimelineEntries(listingId, limit);
  }
  const listings = await prisma.marketListing.findMany({
    where: { propertyId },
    select: { id: true, source: true },
  });
  if (listings.length === 0) return [];
  const listingIds = listings.map((l) => l.id);
  const sourceByListingId = new Map<string, MarketSource>(
    listings.map((l) => [l.id, l.source]),
  );

  const [versions, events] = await Promise.all([
    prisma.marketListingVersion.findMany({
      where: { listingId: { in: listingIds } },
      orderBy: { capturedAt: "desc" },
      take: limit,
      select: {
        id: true,
        listingId: true,
        changedFields: true,
        capturedAt: true,
        before: true,
        after: true,
      },
    }),
    prisma.marketEvent.findMany({
      where: {
        OR: [
          { propertyId },
          { listingId: { in: listingIds } },
        ],
      },
      orderBy: { occurredAt: "desc" },
      take: limit,
      select: {
        id: true,
        listingId: true,
        type: true,
        source: true,
        occurredAt: true,
        payload: true,
      },
    }),
  ]);

  const merged: ClusterTimelineEntry[] = [
    ...versions.map<ClusterTimelineEntry>((v) => ({
      id: `v:${v.id}`,
      kind: "version",
      occurredAt: v.capturedAt.toISOString(),
      listingId: v.listingId,
      source: sourceByListingId.get(v.listingId) ?? null,
      label: v.changedFields.join(", ") || "version",
      payload: { before: v.before, after: v.after, changedFields: v.changedFields },
    })),
    ...events.map<ClusterTimelineEntry>((e) => ({
      id: `e:${e.id}`,
      kind: "event",
      occurredAt: e.occurredAt.toISOString(),
      listingId: e.listingId ?? "",
      source: e.source ?? sourceByListingId.get(e.listingId ?? "") ?? null,
      label: e.type,
      payload: e.payload,
    })),
  ];

  merged.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
  return merged.slice(0, limit);
}

async function getListingTimelineEntries(
  listingId: string,
  limit: number,
): Promise<ClusterTimelineEntry[]> {
  const [versions, events, listing] = await Promise.all([
    prisma.marketListingVersion.findMany({
      where: { listingId },
      orderBy: { capturedAt: "desc" },
      take: limit,
      select: {
        id: true,
        listingId: true,
        changedFields: true,
        capturedAt: true,
        before: true,
        after: true,
      },
    }),
    prisma.marketEvent.findMany({
      where: { listingId },
      orderBy: { occurredAt: "desc" },
      take: limit,
      select: {
        id: true,
        listingId: true,
        type: true,
        source: true,
        occurredAt: true,
        payload: true,
      },
    }),
    prisma.marketListing.findUnique({
      where: { id: listingId },
      select: { source: true },
    }),
  ]);

  const source = listing?.source ?? null;
  const merged: ClusterTimelineEntry[] = [
    ...versions.map<ClusterTimelineEntry>((v) => ({
      id: `v:${v.id}`,
      kind: "version",
      occurredAt: v.capturedAt.toISOString(),
      listingId: v.listingId,
      source,
      label: v.changedFields.join(", ") || "version",
      payload: { before: v.before, after: v.after, changedFields: v.changedFields },
    })),
    ...events.map<ClusterTimelineEntry>((e) => ({
      id: `e:${e.id}`,
      kind: "event",
      occurredAt: e.occurredAt.toISOString(),
      listingId: e.listingId ?? listingId,
      source: e.source ?? source,
      label: e.type,
      payload: e.payload,
    })),
  ];
  merged.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
  return merged.slice(0, limit);
}
