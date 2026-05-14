/**
 * Motor de busqueda de propiedades para microsite, alimentado de MarketListing.
 *
 * Reemplaza `searchSnapshotForDemand` de Statefox cuando
 * `MARKET_PRICING_SOURCE=marketlisting`. Devuelve una shape compatible con
 * `SnapshotSearchResult` (las propiedades son `StatefoxSnapshotProperty`-like
 * construidas desde `MarketListing`) para minimizar cambios en
 * `lib/microsite/selection.ts`.
 *
 * Decisiones MVP:
 *  - Solo cubre ciudades con seeds activos (Cordoba en V1). Si la demanda
 *    apunta a otra ciudad, devolvemos 0 matches (el adapter rutea a Statefox
 *    en ese caso).
 *  - Imagenes desde `MarketListingImage` cuando hay cache; si no, URLs del
 *    portal (que pueden caducar para Idealista).
 *  - Filtro housing: misma logica que comparables.ts (OR sobre subgrupo).
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  queueMarketImageImportsForListings,
  selectMarketListingImages,
} from "@/lib/market/image-import";
import type {
  StatefoxSnapshotProperty,
  StatefoxHousing,
} from "@/lib/statefox/types";
import type { DemandFilterInput } from "@/lib/statefox/query-builder";
import { mapTiposToHousing } from "@/lib/statefox/query-builder";
import { normalizeForComparison } from "@/lib/statefox/snapshot-search";

const DEFAULT_TARGET_RESULTS = 20;
const DEFAULT_MAX_RESULTS = 250;

const HOUSING_MAP: Record<string, string[]> = {
  flat: ["flat", "studio", "loft", "penthouse", "duplex"],
  house: ["house", "countryhouse"],
  garage: ["garage"],
  premises: ["premises", "office"],
  land: ["land"],
  building: ["building"],
};

export interface MarketSearchOptions {
  maxPages?: number;
  targetResults?: number;
  listingType?: "sale" | "rent";
}

export interface MarketSearchResult {
  properties: { id: string; property: StatefoxSnapshotProperty }[];
  totalScanned: number;
  pagesScanned: number;
  earlyExit: boolean;
}

export async function searchMarketForDemand(
  demand: DemandFilterInput,
  options?: MarketSearchOptions,
): Promise<MarketSearchResult> {
  const targetResults = options?.targetResults ?? DEFAULT_TARGET_RESULTS;
  const listingType = options?.listingType ?? "sale";

  const housing = mapTiposToHousing(demand.tipos);
  const housingValues = HOUSING_MAP[housing] ?? [housing];

  const minPrice = demand.presupuestoMin > 0 ? demand.presupuestoMin : null;
  const maxPrice = demand.presupuestoMax > 0 ? demand.presupuestoMax : null;
  const minMeters = demand.metrosMin && demand.metrosMin > 0 ? demand.metrosMin : null;
  const maxMeters = demand.metrosMax && demand.metrosMax > 0 ? demand.metrosMax : null;
  const minRooms = demand.habitacionesMin ?? 0;

  const where: Prisma.MarketListingWhereInput = {
    status: { in: ["active", "unknown"] },
    operation: listingType,
    OR: housingValues.map((h) => ({
      housingType: h as Prisma.MarketListingWhereInput["housingType"],
    })),
  };
  if (minPrice != null || maxPrice != null) {
    where.price = {};
    if (minPrice != null) where.price.gte = minPrice;
    if (maxPrice != null) where.price.lte = maxPrice;
  }
  if (minMeters != null || maxMeters != null) {
    where.builtArea = {};
    if (minMeters != null) where.builtArea.gte = minMeters;
    if (maxMeters != null) where.builtArea.lte = maxMeters;
  }
  if (minRooms > 0) {
    where.rooms = { gte: minRooms };
  }

  const rows = await prisma.marketListing.findMany({
    where,
    orderBy: [{ qualityScore: "desc" }, { lastSeenAt: "desc" }],
    take: DEFAULT_MAX_RESULTS,
    include: {
      advertiser: {
        select: {
          displayName: true,
          advertiserType: true,
          phoneCanonical: true,
        },
      },
      images: {
        where: { status: "IMPORTED", cloudinarySecureUrl: { not: null } },
        orderBy: { imageIndex: "asc" },
        select: { cloudinarySecureUrl: true },
      },
    },
  });

  try {
    await queueMarketImageImportsForListings(
      rows.map((row) => ({
        id: row.id,
        source: row.source,
        imageUrls: row.imageUrls ?? [],
      })),
    );
  } catch (err) {
    console.warn(
      `[market:search] No se pudo encolar MARKET_IMAGE_IMPORT lazy: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  // Filtro de localizacion en memoria (zonas comma-separated, normalizado).
  const keywords = normalizeLocationKeywords(demand.zonas);
  const filtered = rows.filter((row) => matchesCityZone(row, keywords));

  // Truncamos a targetResults para mantener latencia baja (selection.ts
  // hace su propia ampliacion si no encuentra suficientes con imagenes).
  const sliced = filtered.slice(0, Math.max(targetResults, 60));
  const properties = sliced.map((row) => ({
    id: `market:${row.id}`,
    property: rowToStatefoxLike(row),
  }));

  return {
    properties,
    totalScanned: rows.length,
    pagesScanned: 1,
    earlyExit: properties.length >= targetResults,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeLocationKeywords(zonas: string): string[] {
  if (!zonas || !zonas.trim()) return [];
  return zonas
    .split(",")
    .map((z) => normalizeForComparison(z))
    .filter(Boolean);
}

function matchesCityZone(
  row: { city: string; zone: string | null; addressApprox: string | null },
  keywords: string[],
): boolean {
  if (keywords.length === 0) return true;
  const cityName = normalizeForComparison(row.city ?? "");
  const zoneName = normalizeForComparison(row.zone ?? "");
  const address = normalizeForComparison(row.addressApprox ?? "");
  return keywords.some(
    (kw) =>
      cityName.includes(kw) ||
      kw.includes(cityName) ||
      zoneName.includes(kw) ||
      address.includes(kw),
  );
}

type RowWithIncludes = Prisma.MarketListingGetPayload<{
  include: {
    advertiser: {
      select: {
        displayName: true;
        advertiserType: true;
        phoneCanonical: true;
      };
    };
    images: {
      select: { cloudinarySecureUrl: true };
    };
  };
}>;

function rowToStatefoxLike(row: RowWithIncludes): StatefoxSnapshotProperty {
  const cloudinaryFotos = (row.images ?? [])
    .map((i) => i.cloudinarySecureUrl)
    .filter((u): u is string => Boolean(u));
  const fotos = selectMarketListingImages({
    source: row.source,
    portalImages: row.imageUrls ?? [],
    importedImages: cloudinaryFotos,
  }).fotos;
  const phones = [
    row.advertiser?.phoneCanonical,
    ...(row.phones ?? []),
  ].filter((p): p is string => Boolean(p));
  const advertiserType =
    row.advertiser?.advertiserType ?? row.advertiserType;
  const advertType: "private" | "professional" | undefined =
    advertiserType === "particular"
      ? "private"
      : advertiserType === "agency"
        ? "professional"
        : undefined;

  return {
    _id: row.id,
    pStatus: row.status,
    pType: row.operation,
    pHousing: mapMarketHousingToStatefox(row.housingType),
    pDescription: row.description ?? undefined,
    pAddress: row.addressApprox ?? undefined,
    pRooms: row.rooms ?? undefined,
    pFloor: row.floor ?? undefined,
    pBaths: row.bathrooms ?? undefined,
    pPrice: row.price ?? undefined,
    pRef: row.listingReference ?? undefined,
    pLink: row.canonicalUrl,
    pPhones: phones.length > 0 ? phones : undefined,
    pZone: row.zone ?? undefined,
    pMeters: row.builtArea ? { built: row.builtArea } : undefined,
    pAdvert: advertType
      ? {
          name: row.advertiser?.displayName ?? row.advertiserName ?? undefined,
          type: advertType,
        }
      : undefined,
    pPoint:
      row.lat != null && row.lng != null
        ? { latitude: row.lat, longitude: row.lng }
        : undefined,
    pImages: fotos.length > 0 ? fotos : undefined,
    pTS: {
      insert: Math.floor(row.firstSeenAt.getTime() / 1000),
      seen: Math.floor(row.lastSeenAt.getTime() / 1000),
      mod: row.lastChangeAt
        ? Math.floor(row.lastChangeAt.getTime() / 1000)
        : undefined,
    },
    pCity: { cityName: row.city },
  };
}

function mapMarketHousingToStatefox(
  housingType: string,
): StatefoxHousing {
  // Statefox housing codes son distintos al enum MarketHousingType. Para
  // matching basico devolvemos el subgrupo logico (flat, house, garage,
  // premises, ...) y selection.ts lo usara por igualdad string.
  if (
    housingType === "flat" ||
    housingType === "studio" ||
    housingType === "loft" ||
    housingType === "penthouse" ||
    housingType === "duplex"
  )
    return "flat" as StatefoxHousing;
  if (housingType === "house" || housingType === "countryhouse")
    return "house" as StatefoxHousing;
  if (housingType === "garage") return "garage" as StatefoxHousing;
  if (housingType === "premises" || housingType === "office")
    return "premises" as StatefoxHousing;
  if (housingType === "land") return "land" as StatefoxHousing;
  if (housingType === "building") return "building" as StatefoxHousing;
  return housingType as StatefoxHousing;
}
