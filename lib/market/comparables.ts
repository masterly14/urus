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

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { enqueueJob } from "@/lib/job-queue";
import {
  effectiveUrgentPriority,
  getActiveSourcesV1,
  type MarketSource,
} from "@/lib/market";
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
const DEFAULT_RADIUS_METERS = 1_000;
const EXPANDED_RADIUS_METERS = 1_500;
const MAX_RADIUS_METERS = 2_000;
const ON_DEMAND_CRAWL_BUCKET_MS = 10 * 60_000;
const ON_DEMAND_CRAWL_MAX_SEEDS = 3;
const ON_DEMAND_CRAWL_BUDGET_MS = 60_000;
const ON_DEMAND_CRAWL_BUDGET_REQUESTS = 50;

type SeedForOnDemandCrawl = {
  id: string;
  source: MarketSource;
  operation: "sale" | "rent";
  url: string;
  priority: number;
  lastCursor: string | null;
  zone: string | null;
};

function normalizeForComparison(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function distanceMeters(
  a: { latitud: number; longitud: number },
  b: { latitud: number; longitud: number },
): number {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const lat1 = toRadians(a.latitud);
  const lat2 = toRadians(b.latitud);
  const deltaLat = toRadians(b.latitud - a.latitud);
  const deltaLng = toRadians(b.longitud - a.longitud);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
}

function pickOnDemandSeeds(
  seeds: SeedForOnDemandCrawl[],
  zona: string,
): SeedForOnDemandCrawl[] {
  if (!zona.trim()) return seeds.slice(0, ON_DEMAND_CRAWL_MAX_SEEDS);
  const targetZone = normalizeForComparison(zona);
  const zoneMatched = seeds.filter((seed) => {
    const seedZone = normalizeForComparison(seed.zone ?? "");
    if (!seedZone) return false;
    return seedZone.includes(targetZone) || targetZone.includes(seedZone);
  });
  const source = zoneMatched.length > 0 ? zoneMatched : seeds;
  return source.slice(0, ON_DEMAND_CRAWL_MAX_SEEDS);
}

async function triggerOnDemandAreaCrawl(
  input: PricingPropertyInput,
): Promise<void> {
  const city = normalizeForComparison(input.ciudad ?? "");
  if (!city) return;

  const activeSources = getActiveSourcesV1().filter(
    (source): source is Exclude<MarketSource, "unknown"> => source !== "unknown",
  );
  if (activeSources.length === 0) return;

  const seeds = await prisma.marketSeed.findMany({
    where: {
      active: true,
      operation: input.tipoOperacion === "rent" ? "rent" : "sale",
      source: { in: activeSources },
      city: { startsWith: city, mode: "insensitive" },
    },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    take: 20,
    select: {
      id: true,
      source: true,
      operation: true,
      url: true,
      priority: true,
      lastCursor: true,
      zone: true,
    },
  });
  if (seeds.length === 0) return;

  const selectedSeeds = pickOnDemandSeeds(seeds, input.zona ?? "");
  const bucket = Math.floor(Date.now() / ON_DEMAND_CRAWL_BUCKET_MS);
  let enqueued = 0;
  let duplicates = 0;

  for (const seed of selectedSeeds) {
    const correlationId = randomUUID();
    const run = await prisma.marketCrawlRun.create({
      data: {
        seedId: seed.id,
        source: seed.source,
        status: "RUNNING",
        budgetMs: ON_DEMAND_CRAWL_BUDGET_MS,
        budgetRequests: ON_DEMAND_CRAWL_BUDGET_REQUESTS,
        cursorIn: seed.lastCursor,
        correlationId,
      },
      select: { id: true },
    });

    try {
      await enqueueJob({
        type: "MARKET_CRAWL_SEED",
        payload: {
          runId: run.id,
          seedId: seed.id,
          source: seed.source,
          operation: seed.operation,
          url: seed.url,
          cursor: seed.lastCursor,
          budgetMs: ON_DEMAND_CRAWL_BUDGET_MS,
          budgetRequests: ON_DEMAND_CRAWL_BUDGET_REQUESTS,
          traceId: correlationId,
        },
        idempotencyKey: `market:crawl:on-demand:${input.propertyCode}:${seed.id}:${bucket}`,
        priority: effectiveUrgentPriority(seed.priority),
      });
      enqueued++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/Unique constraint|P2002/i.test(message)) {
        duplicates++;
        await prisma.marketCrawlRun.delete({ where: { id: run.id } }).catch(() => undefined);
      } else {
        await prisma.marketCrawlRun
          .update({
            where: { id: run.id },
            data: {
              status: "FAILED",
              errorCode: "ON_DEMAND_ENQUEUE_ERROR",
              errorMessage: message.slice(0, 2000),
              finishedAt: new Date(),
            },
          })
          .catch(() => undefined);
      }
    }
  }

  if (enqueued > 0 || duplicates > 0) {
    console.log(
      `[market:comparables] on-demand crawl enqueued=${enqueued} duplicates=${duplicates} ` +
        `property=${input.propertyCode} city=${input.ciudad} zone=${input.zona ?? "(sin-zona)"}`,
    );
  }
}

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
  radiusMeters?: number;
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
  const radiusMeters = options?.radiusMeters ?? DEFAULT_RADIUS_METERS;

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
    const city = normalizeForComparison(input.ciudad);
    if (city) {
      where.city = { startsWith: city, mode: "insensitive" };
    }
  }

  const rows = await prisma.marketListing.findMany({
    where,
    orderBy: [{ qualityScore: "desc" }, { lastSeenAt: "desc" }],
    take: input.latitud != null && input.longitud != null ? 250 : maxResults,
    include: {
      advertiser: {
        select: {
          displayName: true,
          advertiserType: true,
          phoneCanonical: true,
        },
      },
      images: {
        where: {
          status: "IMPORTED",
          cloudinarySecureUrl: { not: null },
          imageIndex: 0,
        },
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

  let rankedRows = rows;
  if (input.latitud != null && input.longitud != null) {
    const ownPoint = { latitud: input.latitud, longitud: input.longitud };
    const withDistance = rows
      .filter((row) => row.lat != null && row.lng != null)
      .map((row) => ({
        row,
        distance: distanceMeters(ownPoint, {
          latitud: row.lat as number,
          longitud: row.lng as number,
        }),
      }))
      .sort((a, b) => a.distance - b.distance);
    const nearby = withDistance.filter((item) => item.distance <= radiusMeters);
    const expanded =
      nearby.length >= minComparables
        ? nearby
        : withDistance.filter((item) => item.distance <= EXPANDED_RADIUS_METERS);
    const capped =
      expanded.length >= minComparables
        ? expanded
        : withDistance.filter((item) => item.distance <= MAX_RADIUS_METERS);
    if (capped.length > 0) {
      rankedRows = capped.map((item) => item.row);
    } else {
      rankedRows = withDistance.map((item) => item.row);
      await triggerOnDemandAreaCrawl(input).catch((err) => {
        console.warn(
          `[market:comparables] no se pudo encolar recrawl on-demand para ${input.propertyCode}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });
    }
  }

  const comparables = rankedRows.slice(0, maxResults).map((row) => mapToComparable(row));
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
    extras: extractExtras(),
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

function extractExtras(): Partial<PricingPropertyExtras> {
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
