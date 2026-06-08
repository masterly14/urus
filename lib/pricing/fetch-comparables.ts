/**
 * Consulta la API REST de Statefox para obtener comparables de mercado.
 *
 * Usa GET /snapshot (cursor-based, 250 items/pág) en vez de GET /properties
 * porque /snapshot contiene el inventario completo rastreado por Statefox,
 * mientras /properties solo devuelve las últimas inserciones (volumen mínimo).
 *
 * pPricePerMeter no existe en /snapshot; se calcula como pPrice / pMeters.built.
 *
 * Estrategia: paginar /snapshot filtrando en memoria por pHousing, pCity,
 * rango de precio y rango de metros. Se detiene al alcanzar minComparables
 * o maxPages.
 */

import { createStatefoxClient, getSnapshot } from "@/lib/statefox/client";
import { mapTiposToHousing } from "@/lib/statefox/query-builder";
import type {
  StatefoxSnapshotProperty,
  StatefoxSnapshotPropertyExtras,
  StatefoxPropertyCity,
  StatefoxPropertyZone,
} from "@/lib/statefox/types";
import { isExpiredStatefoxImageUrl } from "@/lib/statefox/image-expiry";
import { hydrateComparablesWithImageCache } from "@/lib/statefox/image-cache";
import { prisma } from "@/lib/prisma";
import {
  getPricingMinRawComparablesBeforeStop,
  getPricingStatefoxMaxPages,
  shouldSkipComparableImageHydrate,
} from "./runtime-config";
import type {
  ComparableDecisionReason,
  ComparableDecisionTrace,
  PricingComparabilityMeta,
  PricingPropertyInput,
  PricingComparable,
  PricingPropertyExtras,
  PropertyComparabilityProfile,
} from "./types";

const DEFAULT_PRICE_RANGE_PERCENT = 20;
const DEFAULT_METERS_RANGE_PERCENT = 20;
/** Rangos por defecto en path Statefox (/snapshot): más amplios que MarketListing. */
const STATEFOX_DEFAULT_PRICE_RANGE_PERCENT = 35;
const STATEFOX_DEFAULT_METERS_RANGE_PERCENT = 30;
const DEFAULT_MIN_COMPARABLES = 5;
const ITEMS_PER_PAGE = 250;

/** Tipologías Statefox consideradas comparables entre sí (vivienda urbana). */
const STATEFOX_HOUSING_COMPAT: Record<string, readonly string[]> = {
  flat: ["flat", "penthouse", "duplex", "studio", "loft"],
  penthouse: ["penthouse", "flat", "duplex", "loft"],
  duplex: ["duplex", "flat", "penthouse", "loft"],
  studio: ["studio", "flat", "penthouse"],
  loft: ["loft", "flat", "penthouse", "duplex"],
  house: ["house", "countryhouse"],
  countryhouse: ["countryhouse", "house"],
};

export interface FetchComparablesOptions {
  priceRangePercent?: number;
  metersRangePercent?: number;
  maxPages?: number;
  minComparables?: number;
  comparabilityProfile?: PropertyComparabilityProfile;
  /** Contexto para límites de páginas Statefox (p. ej. api_manual_async). */
  sourceTrigger?: string;
}

export interface FetchComparablesResult {
  comparables: PricingComparable[];
  totalResultsFromAPI: number;
  pagesScanned: number;
  comparabilityMeta: PricingComparabilityMeta;
}

function normalizeForComparison(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function matchesCity(prop: StatefoxSnapshotProperty, ciudad: string): boolean {
  const target = normalizeForComparison(ciudad);
  if (!target) return true;

  const cityName = normalizeForComparison(prop.pCity?.cityName ?? "");
  const address = normalizeForComparison(prop.pAddress ?? "");

  return cityName.includes(target) || target.includes(cityName) || address.includes(target);
}

function resolveStatefoxHousingTypes(tipologiaNombre: string): Set<string> {
  if (!tipologiaNombre.trim()) {
    return new Set(STATEFOX_HOUSING_COMPAT.flat);
  }
  const primary = mapTiposToHousing(tipologiaNombre);
  const compat = STATEFOX_HOUSING_COMPAT[primary];
  return new Set(compat ?? [primary]);
}

function matchesHousingTypes(prop: StatefoxSnapshotProperty, allowed: Set<string>): boolean {
  const housing = prop.pHousing ?? "";
  if (!housing) return false;
  return allowed.has(housing);
}

function isInPriceRange(price: number, refPrice: number, rangePercent: number): boolean {
  const min = refPrice * (1 - rangePercent / 100);
  const max = refPrice * (1 + rangePercent / 100);
  return price >= min && price <= max;
}

function isInMetersRange(meters: number, refMeters: number, rangePercent: number): boolean {
  if (meters <= 0 || refMeters <= 0) return true;
  const min = refMeters * (1 - rangePercent / 100);
  const max = refMeters * (1 + rangePercent / 100);
  return meters >= min && meters <= max;
}

function computePricePerMeter(prop: StatefoxSnapshotProperty): number {
  const price = prop.pPrice ?? 0;
  const meters = prop.pMeters?.built ?? 0;
  if (price <= 0 || meters <= 0) return 0;
  return Math.round(price / meters);
}

function computeDaysPublished(prop: StatefoxSnapshotProperty): number | null {
  const insertTs = prop.pTS?.insert;
  if (insertTs && insertTs > 0) {
    return Math.max(0, Math.floor((Date.now() - insertTs * 1000) / (1000 * 60 * 60 * 24)));
  }
  return null;
}

function mapAdvertiserType(prop: StatefoxSnapshotProperty): "private" | "professional" | "unknown" {
  const type = prop.pAdvert?.type;
  if (type === "private" || type === "professional") return type;
  return "unknown";
}

function mapExtras(ext: StatefoxSnapshotPropertyExtras | undefined): Partial<PricingPropertyExtras> {
  if (!ext) return {};
  return {
    terraza: ext.terrace ?? false,
    garaje: false,
    ascensor: ext.lift ?? false,
    trastero: ext.boxroom ?? false,
    piscina: false,
    aireAcondicionado: ext.aircond ?? ext.airConditioning ?? false,
    calefaccion: ext.heating ?? null,
    anoConstruccion: ext.year ?? null,
    certificadoEnergetico: ext.certenerat ?? null,
  };
}

function resolveZoneName(pZone: string | StatefoxPropertyZone | undefined): string {
  if (!pZone) return "";
  if (typeof pZone === "string") return pZone;
  return pZone.name ?? "";
}

function toComparable(id: string, prop: StatefoxSnapshotProperty): PricingComparable {
  const advertiserType = mapAdvertiserType(prop);
  const rawFotos = Array.isArray(prop.pImages)
    ? prop.pImages.filter((u) => typeof u === "string" && (u.startsWith("http://") || u.startsWith("https://")))
    : [];
  const fotos = rawFotos.filter((u) => !isExpiredStatefoxImageUrl(u));
  return {
    statefoxId: id,
    precio: prop.pPrice ?? 0,
    precioM2: computePricePerMeter(prop),
    metrosConstruidos: prop.pMeters?.built ?? 0,
    habitaciones: prop.pRooms ?? 0,
    banyos: prop.pBaths ?? 0,
    ciudad: prop.pCity?.cityName ?? "",
    zona: resolveZoneName(prop.pZone),
    tipologia: prop.pHousing ?? "",
    advertiserType,
    extras: mapExtras(prop.pExtras),
    link: prop.pLink ?? null,
    diasPublicado: computeDaysPublished(prop),
    descripcion: prop.pDescription ?? null,
    direccion: prop.pAddress ?? null,
    fotos,
    imageCacheStatus: fotos.length > 0 ? "PENDING" : undefined,
    anunciante: {
      nombre: prop.pAdvert?.name ?? null,
      tipo: advertiserType,
      telefonos: prop.pPhones ?? [],
    },
    latitud: prop.pPoint?.latitude ?? null,
    longitud: prop.pPoint?.longitude ?? null,
    planta: prop.pFloor ?? null,
    orientacion: prop.pOrientation ?? null,
    referencia: prop.pRef ?? null,
  };
}

function createDefaultComparabilityMeta(candidateCount: number): PricingComparabilityMeta {
  return {
    comparabilityFilterApplied: false,
    effectiveAllowedZoneCodes: [],
    effectiveExcludedZoneCodes: [],
    candidatesBeforeFilter: candidateCount,
    candidatesAfterFilter: candidateCount,
    excludedByReason: {},
    comparableDecisions: [],
  };
}

function classifyComparabilityMode(
  profile: PropertyComparabilityProfile,
): "ready" | "heuristic" | "fallback" {
  if (profile.pricingProfileStatus === "ready") return "ready";
  if (profile.pricingProfileStatus === "heuristic") return "heuristic";
  return "fallback";
}

async function resolveCandidateZoneCodes(
  candidates: PricingComparable[],
  profile: PropertyComparabilityProfile | undefined,
): Promise<Map<string, string | null>> {
  const zoneByComparableId = new Map<string, string | null>();
  if (!profile) return zoneByComparableId;
  const keyLoca = profile.keyLoca ?? 224499;
  const catalogVersion = profile.catalogVersion || "v1.1";

  const aliases = await prisma.marketZoneAlias.findMany({
    where: { keyLoca, isActive: true },
    select: { aliasNormalized: true, zoneCode: true },
  });
  const aliasMap = new Map<string, string>();
  for (const alias of aliases) {
    if (!aliasMap.has(alias.aliasNormalized)) aliasMap.set(alias.aliasNormalized, alias.zoneCode);
  }

  const canonicals = await prisma.marketZoneProfile.findMany({
    where: { catalogVersion, keyLoca, isActive: true },
    select: { suggestedZoneCode: true, zoneNameCanonical: true },
  });
  const canonicalMap = new Map<string, string>();
  for (const item of canonicals) {
    canonicalMap.set(normalizeForComparison(item.zoneNameCanonical), item.suggestedZoneCode);
  }

  for (const candidate of candidates) {
    const zoneRaw = candidate.zona ?? "";
    const zoneNormalized = normalizeForComparison(zoneRaw);
    let resolved: string | null = null;
    if (zoneNormalized) {
      resolved = aliasMap.get(zoneNormalized) ?? canonicalMap.get(zoneNormalized) ?? null;
    }
    zoneByComparableId.set(candidate.statefoxId, resolved);
  }
  return zoneByComparableId;
}

async function applyComparabilityFilter(
  candidates: PricingComparable[],
  profile: PropertyComparabilityProfile | undefined,
  options?: { relaxed?: boolean },
): Promise<{ filtered: PricingComparable[]; meta: PricingComparabilityMeta }> {
  if (!profile) {
    return {
      filtered: candidates,
      meta: createDefaultComparabilityMeta(candidates.length),
    };
  }

  const mode = classifyComparabilityMode(profile);
  const resolvedZones = await resolveCandidateZoneCodes(candidates, profile);

  const excludedSet = new Set(profile.excludedZoneCodes);
  const allowedSet = new Set<string>();
  if (mode === "ready") {
    for (const code of profile.allowedZoneCodes) allowedSet.add(code);
  } else if (mode === "heuristic") {
    if (profile.zoneCode) allowedSet.add(profile.zoneCode);
    for (const code of profile.allowedZoneCodes) allowedSet.add(code);
  } else {
    if (profile.zoneCode) allowedSet.add(profile.zoneCode);
  }

  const decisions: ComparableDecisionTrace[] = [];
  const included: PricingComparable[] = [];
  const excludedByReason: Record<string, number> = {};

  const bump = (reason: ComparableDecisionReason): void => {
    excludedByReason[reason] = (excludedByReason[reason] ?? 0) + 1;
  };

  for (const candidate of candidates) {
    const zoneCode = resolvedZones.get(candidate.statefoxId) ?? null;
    const zoneRaw = candidate.zona ?? "";

    if (zoneCode && excludedSet.has(zoneCode)) {
      const reason: ComparableDecisionReason = "ZONE_EXCLUDED_NOT_COMPARABLE";
      decisions.push({
        statefoxId: candidate.statefoxId,
        candidateZoneRaw: zoneRaw,
        candidateZoneCodeResolved: zoneCode,
        decision: "excluded",
        reason,
      });
      bump(reason);
      continue;
    }

    if (options?.relaxed && !zoneCode) {
      decisions.push({
        statefoxId: candidate.statefoxId,
        candidateZoneRaw: zoneRaw,
        candidateZoneCodeResolved: zoneCode,
        decision: "included",
        reason: "ZONE_INCLUDED_STATEFOX_RELAXED",
      });
      included.push(candidate);
      continue;
    }

    if (allowedSet.size > 0) {
      if (!zoneCode || !allowedSet.has(zoneCode)) {
        const reason: ComparableDecisionReason =
          mode === "fallback" ? "ZONE_UNKNOWN_FALLBACK" : "ZONE_NOT_ALLOWED";
        decisions.push({
          statefoxId: candidate.statefoxId,
          candidateZoneRaw: zoneRaw,
          candidateZoneCodeResolved: zoneCode,
          decision: "excluded",
          reason,
        });
        bump(reason);
        continue;
      }
    } else if (mode === "fallback") {
      if (options?.relaxed) {
        decisions.push({
          statefoxId: candidate.statefoxId,
          candidateZoneRaw: zoneRaw,
          candidateZoneCodeResolved: zoneCode,
          decision: "included",
          reason: "ZONE_INCLUDED_STATEFOX_RELAXED",
        });
        included.push(candidate);
        continue;
      }
      const reason: ComparableDecisionReason = "ZONE_UNKNOWN_FALLBACK";
      decisions.push({
        statefoxId: candidate.statefoxId,
        candidateZoneRaw: zoneRaw,
        candidateZoneCodeResolved: zoneCode,
        decision: "excluded",
        reason,
      });
      bump(reason);
      continue;
    }

    const includeReason: ComparableDecisionReason =
      mode === "ready"
        ? "ZONE_INCLUDED_READY"
        : mode === "heuristic"
          ? "ZONE_INCLUDED_HEURISTIC"
          : "ZONE_INCLUDED_FALLBACK";

    decisions.push({
      statefoxId: candidate.statefoxId,
      candidateZoneRaw: zoneRaw,
      candidateZoneCodeResolved: zoneCode,
      decision: "included",
      reason: includeReason,
    });
    included.push(candidate);
  }

  return {
    filtered: included,
    meta: {
      comparabilityFilterApplied: true,
      effectiveAllowedZoneCodes: [...allowedSet].sort(),
      effectiveExcludedZoneCodes: [...excludedSet].sort(),
      candidatesBeforeFilter: candidates.length,
      candidatesAfterFilter: included.length,
      excludedByReason,
      comparableDecisions: decisions,
    },
  };
}

/**
 * Devuelve comparables para pricing. Source elegida via env:
 *   - MARKET_PRICING_SOURCE=marketlisting => `lib/market/comparables.ts`
 *     (in-house, sin coste por request, multi-portal). Recomendado para
 *     ciudades con seeds activos (Cordoba en V1).
 *   - MARKET_PRICING_SOURCE=statefox (default) => Statefox /snapshot.
 *
 * El adapter en MarketListing falla suave a Statefox si devuelve cero
 * comparables, para no romper pricing en ciudades sin seeds.
 */
export async function fetchPricingComparables(
  input: PricingPropertyInput,
  options?: FetchComparablesOptions,
): Promise<FetchComparablesResult> {
  const source = (process.env.MARKET_PRICING_SOURCE ?? "statefox").toLowerCase();
  if (source === "marketlisting") {
    const { fetchMarketComparables } = await import("@/lib/market/comparables");
    const result = await fetchMarketComparables(input, {
      priceRangePercent: options?.priceRangePercent,
      metersRangePercent: options?.metersRangePercent,
      minComparables: options?.minComparables,
    });
    if (result.comparables.length > 0) {
      const filtered = await applyComparabilityFilter(result.comparables, options?.comparabilityProfile);
      if (filtered.filtered.length > 0) {
        return {
          comparables: filtered.filtered,
          totalResultsFromAPI: result.totalResultsFromAPI,
          pagesScanned: result.pagesScanned,
          comparabilityMeta: filtered.meta,
        };
      }
      console.log(
        `[pricing] MARKET_PRICING_SOURCE=marketlisting: ${result.comparables.length} candidatos, ` +
          `comparabilidad dejo 0 para ${input.propertyCode} (ciudad=${input.ciudad}); cayendo a Statefox.`,
      );
    } else {
      console.log(
        `[pricing] MARKET_PRICING_SOURCE=marketlisting devolvio 0 comparables para ${input.propertyCode} ` +
          `(ciudad=${input.ciudad}); cayendo a Statefox.`,
      );
    }
  }

  return fetchStatefoxComparables(input, options);
}

async function fetchStatefoxComparables(
  input: PricingPropertyInput,
  options?: FetchComparablesOptions,
): Promise<FetchComparablesResult> {
  const priceRange =
    options?.priceRangePercent ?? STATEFOX_DEFAULT_PRICE_RANGE_PERCENT;
  const metersRange =
    options?.metersRangePercent ?? STATEFOX_DEFAULT_METERS_RANGE_PERCENT;
  const maxPages =
    options?.maxPages ?? getPricingStatefoxMaxPages(options?.sourceTrigger);
  const minComparables = options?.minComparables ?? DEFAULT_MIN_COMPARABLES;
  const minRawBeforeStop = getPricingMinRawComparablesBeforeStop(minComparables);

  const allowedHousing = resolveStatefoxHousingTypes(input.tipologiaNombre);
  const client = createStatefoxClient();

  const seen = new Set<string>();
  const comparables: PricingComparable[] = [];
  let totalResultsFromAPI = 0;
  let pagesScanned = 0;
  let cursor: string | undefined;

  while (pagesScanned < maxPages) {
    let response;
    try {
      response = await getSnapshot(client, {
        items: ITEMS_PER_PAGE,
        type: input.tipoOperacion,
        status: "active",
        next: cursor,
      });
    } catch (err) {
      console.error(
        `[pricing] Error consultando Statefox /snapshot (pág ${pagesScanned + 1}): ${err instanceof Error ? err.message : String(err)}`,
      );
      break;
    }

    pagesScanned++;
    const entries = Object.entries(response.result ?? {});
    totalResultsFromAPI += entries.length;

    for (const [id, prop] of entries) {
      if (seen.has(id)) continue;
      seen.add(id);

      if (!prop.pPrice || prop.pPrice <= 0) continue;
      if (!matchesHousingTypes(prop, allowedHousing)) continue;
      if (!matchesCity(prop, input.ciudad)) continue;
      if (!isInPriceRange(prop.pPrice, input.precio, priceRange)) continue;

      const meters = prop.pMeters?.built ?? 0;
      if (!isInMetersRange(meters, input.metrosConstruidos, metersRange)) continue;

      comparables.push(toComparable(id, prop));
    }

    const nextCursor = response.meta?.next;
    if (!nextCursor || entries.length === 0) break;
    if (comparables.length >= minRawBeforeStop) break;

    cursor = nextCursor;
  }

  const comparablesWithCachedImages = shouldSkipComparableImageHydrate()
    ? comparables
    : await hydrateComparablesWithImageCache(comparables, { cacheOnly: true });

  const filtered = await applyComparabilityFilter(
    comparablesWithCachedImages,
    options?.comparabilityProfile,
    { relaxed: true },
  );
  return {
    comparables: filtered.filtered,
    totalResultsFromAPI,
    pagesScanned,
    comparabilityMeta: filtered.meta,
  };
}
