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
import type { PricingPropertyInput, PricingComparable, PricingPropertyExtras } from "./types";

const DEFAULT_PRICE_RANGE_PERCENT = 20;
const DEFAULT_METERS_RANGE_PERCENT = 20;
const DEFAULT_MAX_PAGES = 30;
const DEFAULT_MIN_COMPARABLES = 5;
const ITEMS_PER_PAGE = 250;
let pricingImageDebugLogs = 0;

export interface FetchComparablesOptions {
  priceRangePercent?: number;
  metersRangePercent?: number;
  maxPages?: number;
  minComparables?: number;
}

export interface FetchComparablesResult {
  comparables: PricingComparable[];
  totalResultsFromAPI: number;
  pagesScanned: number;
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

function matchesHousing(prop: StatefoxSnapshotProperty, housing: string): boolean {
  return (prop.pHousing ?? "") === housing;
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

function summarizeImageShape(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      sampleTypes: value.slice(0, 3).map((item) => typeof item),
      firstObjectKeys:
        value.find((item) => item && typeof item === "object" && !Array.isArray(item))
          ? Object.keys(value.find((item) => item && typeof item === "object" && !Array.isArray(item)) as Record<string, unknown>).slice(0, 8)
          : [],
    };
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const first = Object.values(obj).find((item) => item && typeof item === "object" && !Array.isArray(item));
    return {
      type: "object",
      keys: Object.keys(obj).slice(0, 8),
      firstObjectKeys: first ? Object.keys(first as Record<string, unknown>).slice(0, 8) : [],
    };
  }
  return { type: typeof value, present: value != null };
}

function toComparable(id: string, prop: StatefoxSnapshotProperty): PricingComparable {
  const advertiserType = mapAdvertiserType(prop);
  const rawFotos = Array.isArray(prop.pImages)
    ? prop.pImages.filter((u) => typeof u === "string" && (u.startsWith("http://") || u.startsWith("https://")))
    : [];
  const fotos = rawFotos.filter((u) => !isExpiredStatefoxImageUrl(u));
  if (pricingImageDebugLogs < 5) {
    pricingImageDebugLogs++;
    // #region agent log
    fetch("http://127.0.0.1:7478/ingest/3a86774c-7051-4ca6-b6e8-a92160972b21", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "bfe3e0" }, body: JSON.stringify({ sessionId: "bfe3e0", runId: "post-fix", hypothesisId: "H8", location: "lib/pricing/fetch-comparables.ts:toComparable", message: "Pricing comparable image extraction filtered expired URLs", data: { statefoxId: id, rawImageShape: summarizeImageShape((prop as Record<string, unknown>).pImages), hasPropertyMainImage: typeof (prop as Record<string, unknown>).propertyMainImage === "string", hasImagesField: Object.prototype.hasOwnProperty.call(prop as Record<string, unknown>, "images"), rawFotosCount: rawFotos.length, expiredFotosCount: rawFotos.length - fotos.length, extractedFotosCount: fotos.length }, timestamp: Date.now() }) }).catch(() => {});
    // #endregion
  }
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

export async function fetchPricingComparables(
  input: PricingPropertyInput,
  options?: FetchComparablesOptions,
): Promise<FetchComparablesResult> {
  const priceRange = options?.priceRangePercent ?? DEFAULT_PRICE_RANGE_PERCENT;
  const metersRange = options?.metersRangePercent ?? DEFAULT_METERS_RANGE_PERCENT;
  const maxPages = options?.maxPages ?? DEFAULT_MAX_PAGES;
  const minComparables = options?.minComparables ?? DEFAULT_MIN_COMPARABLES;

  const housing = mapTiposToHousing(input.tipologiaNombre);
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
      if (!matchesHousing(prop, housing)) continue;
      if (!matchesCity(prop, input.ciudad)) continue;
      if (!isInPriceRange(prop.pPrice, input.precio, priceRange)) continue;

      const meters = prop.pMeters?.built ?? 0;
      if (!isInMetersRange(meters, input.metrosConstruidos, metersRange)) continue;

      comparables.push(toComparable(id, prop));
    }

    const nextCursor = response.meta?.next;
    if (!nextCursor || entries.length === 0) break;
    if (comparables.length >= minComparables) break;

    cursor = nextCursor;
  }

  return { comparables, totalResultsFromAPI, pagesScanned };
}
