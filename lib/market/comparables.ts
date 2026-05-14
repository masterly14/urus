/**
 * Pricing comparables alimentados desde MarketListing (in-house).
 *
 * Reemplaza `lib/pricing/fetch-comparables.ts` (que lee de Statefox /snapshot)
 * cuando `MARKET_PRICING_SOURCE=marketlisting` (config global) o cuando la
 * propiedad/demanda esta en una ciudad servida por seeds de MarketListing.
 *
 * Devuelve el mismo `PricingComparable[]` que el adapter de Statefox para que
 * el resto del pipeline pricing (recomendacion LangGraph, persistencia
 * `PricingReport`, plantilla WhatsApp) no requiera cambios.
 *
 * Ventajas vs Statefox:
 *  - Sin paginacion de portal: query SQL contra `market_listings` indexado.
 *  - Volumen mayor: cobertura cruzada de Idealista + Fotocasa + Pisos.com.
 *  - Sin coste por request (Statefox tiene rate limit y latencia variable).
 *
 * Limitaciones MVP:
 *  - Solo ciudades con `MarketSeed` activo (Cordoba en V1).
 *  - Imagenes desde `MarketListingImage` cuando el cache lazy las tiene
 *    importadas; si no, devuelve URLs originales del portal (que pueden
 *    caducar para Idealista; el usuario las re-importa manualmente).
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  queueMarketImageImportsForListings,
  selectMarketListingImages,
} from "@/lib/market/image-import";
import type {
  PricingComparable,
  PricingPropertyExtras,
  PricingPropertyInput,
} from "@/lib/pricing/types";

const DEFAULT_PRICE_RANGE_PCT = 20;
const DEFAULT_METERS_RANGE_PCT = 20;
const DEFAULT_MIN_COMPARABLES = 5;
const DEFAULT_MAX_RESULTS = 60;

const HOUSING_MAP: Record<string, string[]> = {
  // Mapeo desde el `housing` de Statefox al enum MarketHousingType.
  flat: ["flat", "studio", "loft", "penthouse", "duplex"],
  house: ["house", "countryhouse"],
  garage: ["garage"],
  premises: ["premises", "office"],
  land: ["land"],
  building: ["building"],
};

export interface FetchMarketComparablesOptions {
  priceRangePercent?: number;
  metersRangePercent?: number;
  minComparables?: number;
  maxResults?: number;
}

export interface FetchMarketComparablesResult {
  comparables: PricingComparable[];
  totalResultsFromAPI: number;
  pagesScanned: number;
}

export async function fetchMarketComparables(
  input: PricingPropertyInput,
  options?: FetchMarketComparablesOptions,
): Promise<FetchMarketComparablesResult> {
  const priceRange = options?.priceRangePercent ?? DEFAULT_PRICE_RANGE_PCT;
  const metersRange = options?.metersRangePercent ?? DEFAULT_METERS_RANGE_PCT;
  const minComparables = options?.minComparables ?? DEFAULT_MIN_COMPARABLES;
  const maxResults = options?.maxResults ?? DEFAULT_MAX_RESULTS;

  const housingValues = HOUSING_MAP[mapStatefoxHousing(input.tipologiaNombre)] ?? [
    "flat",
  ];

  const priceMin = Math.round(input.precio * (1 - priceRange / 100));
  const priceMax = Math.round(input.precio * (1 + priceRange / 100));
  const areaMin = Math.round(input.metrosConstruidos * (1 - metersRange / 100));
  const areaMax = Math.round(input.metrosConstruidos * (1 + metersRange / 100));

  const where: Prisma.MarketListingWhereInput = {
    status: { in: ["active", "unknown"] },
    operation: input.tipoOperacion === "sale" ? "sale" : "rent",
    // OR de housingType para evitar dependencia exacta del enum en runtime;
    // los valores no validos del array simplemente no matchean.
    OR: housingValues.map((h) => ({
      housingType: h as Prisma.MarketListingWhereInput["housingType"],
    })),
    price: { gte: priceMin, lte: priceMax },
    builtArea: { gte: areaMin, lte: areaMax },
  };
  if (input.ciudad) {
    where.city = { startsWith: input.ciudad, mode: "insensitive" };
  }

  const rows = await prisma.marketListing.findMany({
    where,
    orderBy: [{ qualityScore: "desc" }, { lastSeenAt: "desc" }],
    take: maxResults,
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
        select: { cloudinarySecureUrl: true, imageIndex: true },
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
      `[market:comparables] No se pudo encolar MARKET_IMAGE_IMPORT lazy: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  const comparables = rows.map((row) => mapToComparable(row));
  // Permitimos devolver menos de minComparables; el caller decide.
  return {
    comparables,
    totalResultsFromAPI: comparables.length,
    pagesScanned: 1,
    // pagesScanned mantenido por compat; aqui no paginamos.
  };
}

function mapStatefoxHousing(tipologia: string): string {
  const t = tipologia.toLowerCase();
  if (t.includes("piso") || t.includes("apart") || t.includes("estudio") || t.includes("atico") || t.includes("duplex") || t.includes("loft")) {
    return "flat";
  }
  if (t.includes("casa") || t.includes("chalet") || t.includes("unifam") || t.includes("campo") || t.includes("finca")) {
    return "house";
  }
  if (t.includes("garaje") || t.includes("plaza")) return "garage";
  if (t.includes("local") || t.includes("oficina")) return "premises";
  if (t.includes("solar") || t.includes("terreno")) return "land";
  if (t.includes("edificio")) return "building";
  return "flat";
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
      select: { cloudinarySecureUrl: true; imageIndex: true };
    };
  };
}>;

function mapToComparable(row: RowWithIncludes): PricingComparable {
  const advertiserType = mapAdvertiserType(
    row.advertiser?.advertiserType ?? row.advertiserType,
  );
  const cloudinaryFotos = (row.images ?? [])
    .map((i) => i.cloudinarySecureUrl)
    .filter((u): u is string => Boolean(u));
  const imageSelection = selectMarketListingImages({
    source: row.source,
    portalImages: row.imageUrls ?? [],
    importedImages: cloudinaryFotos,
  });
  const fotos = imageSelection.fotos;
  const pricePerMeter = row.pricePerMeter ?? computePpm(row.price, row.builtArea);
  const phones = [
    row.advertiser?.phoneCanonical,
    ...(row.phones ?? []),
  ].filter((p): p is string => Boolean(p));

  return {
    statefoxId: `market:${row.id}`,
    precio: row.price ?? 0,
    precioM2: pricePerMeter ?? 0,
    metrosConstruidos: row.builtArea ?? 0,
    habitaciones: row.rooms ?? 0,
    banyos: row.bathrooms ?? 0,
    ciudad: row.city,
    zona: row.zone ?? "",
    tipologia: row.housingType,
    advertiserType,
    extras: extractExtras(row),
    link: row.canonicalUrl,
    diasPublicado: computeDaysPublished(row.firstSeenAt),
    descripcion: row.description,
    direccion: row.addressApprox,
    fotos,
    imageCacheStatus: imageSelection.imageCacheStatus,
    anunciante: {
      nombre: row.advertiser?.displayName ?? row.advertiserName ?? null,
      tipo: advertiserType,
      telefonos: phones,
    },
    latitud: row.lat,
    longitud: row.lng,
    planta: row.floor,
    orientacion: null,
    referencia: row.listingReference,
  };
}

function mapAdvertiserType(
  raw: string | null,
): "private" | "professional" | "unknown" {
  if (raw === "particular") return "private";
  if (raw === "agency") return "professional";
  return "unknown";
}

function computePpm(price: number | null, area: number | null): number | null {
  if (!price || !area || price <= 0 || area <= 0) return null;
  return Math.round(price / area);
}

function computeDaysPublished(firstSeenAt: Date | null): number | null {
  if (!firstSeenAt) return null;
  return Math.max(
    0,
    Math.floor((Date.now() - firstSeenAt.getTime()) / (1000 * 60 * 60 * 24)),
  );
}

function extractExtras(row: RowWithIncludes): Partial<PricingPropertyExtras> {
  // MarketListing aun no tiene un set rico de extras; cuando los extractores
  // los pueblen (terraza/garaje/etc.), poblar desde columnas dedicadas o JSON.
  // Mantenemos shape compatible con Statefox para no romper el pipeline.
  return {
    terraza: false,
    garaje: false,
    ascensor: false,
    trastero: false,
    piscina: false,
    aireAcondicionado: false,
    calefaccion: null,
    anoConstruccion: null,
    certificadoEnergetico: null,
  };
}
