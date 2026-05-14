/**
 * Motor de búsqueda sobre GET /snapshot de Statefox.
 *
 * @deprecated Migracion a MarketListing in-house en curso. Cuando
 * `MARKET_PRICING_SOURCE=marketlisting`, el consumidor debe usar
 * `lib/market/search.ts:searchMarketForDemand`. Statefox queda como
 * fallback hasta que MarketListing tenga cobertura multi-ciudad.
 * Ver docs/statefox-deprecation.md.
 *
 * Reemplaza la consulta a GET /properties para matching y microsite.
 * /snapshot contiene el inventario completo rastreado (todos los portales),
 * paginado con cursor, lo que permite filtrar en memoria con volumen real.
 *
 * Estrategia: paginar /snapshot filtrando en memoria por housing, ciudad/zona,
 * rango de precio, rango de metros y habitaciones mínimas.
 * Early exit cuando se alcanzan suficientes matches o se agotan las páginas.
 */

import { createStatefoxClient, getSnapshot } from "./client";
import type { StatefoxClient } from "./client";
import type {
  StatefoxSnapshotProperty,
  StatefoxListingType,
  StatefoxHousing,
  StatefoxPropertyCity,
  StatefoxPropertyZone,
} from "./types";
import type { DemandFilterInput } from "./query-builder";
import { mapTiposToHousing } from "./query-builder";

const ITEMS_PER_PAGE = 250;
const DEFAULT_MAX_PAGES = 6;
const DEFAULT_TARGET_RESULTS = 20;

// ---------------------------------------------------------------------------
// Opciones y resultado
// ---------------------------------------------------------------------------

export interface SnapshotSearchOptions {
  /** Máximo de páginas de snapshot a escanear. Default: 10 (2500 props). */
  maxPages?: number;
  /** Dejar de paginar al alcanzar este número de matches. Default: 20. */
  targetResults?: number;
  /** Tipo de operación: sale o rent. Default: sale. */
  listingType?: StatefoxListingType;
  /** Cliente Statefox ya creado (evita recrear si el caller lo tiene). */
  client?: StatefoxClient;
}

export interface SnapshotSearchResult {
  properties: SnapshotMatchedProperty[];
  totalScanned: number;
  pagesScanned: number;
  /** true si se detuvo antes de agotar el inventario (por targetResults). */
  earlyExit: boolean;
}

export interface SnapshotMatchedProperty {
  id: string;
  property: StatefoxSnapshotProperty;
}

// ---------------------------------------------------------------------------
// Normalización de texto para comparación
// ---------------------------------------------------------------------------

export function normalizeForComparison(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// ---------------------------------------------------------------------------
// Funciones de matching (exportadas para testing)
// ---------------------------------------------------------------------------

export function matchesCity(
  prop: StatefoxSnapshotProperty,
  keywords: string[],
): boolean {
  if (keywords.length === 0) return true;

  const cityName = normalizeForComparison(prop.pCity?.cityName ?? "");
  const zoneName = normalizeForComparison(resolveZoneName(prop.pZone));
  const address = normalizeForComparison(prop.pAddress ?? "");

  return keywords.some(
    (kw) =>
      cityName.includes(kw) ||
      kw.includes(cityName) ||
      zoneName.includes(kw) ||
      address.includes(kw),
  );
}

export function matchesHousing(
  prop: StatefoxSnapshotProperty,
  housing: StatefoxHousing,
): boolean {
  return (prop.pHousing ?? "") === housing;
}

export function matchesPriceRange(
  prop: StatefoxSnapshotProperty,
  minPrice: number | null,
  maxPrice: number | null,
): boolean {
  const price = prop.pPrice ?? 0;
  if (price <= 0) return false;
  if (minPrice !== null && price < minPrice) return false;
  if (maxPrice !== null && price > maxPrice) return false;
  return true;
}

export function matchesMetersRange(
  prop: StatefoxSnapshotProperty,
  minMeters: number | null,
  maxMeters: number | null,
): boolean {
  const meters = prop.pMeters?.built ?? 0;
  if (meters <= 0) return true;
  if (minMeters !== null && meters < minMeters) return false;
  if (maxMeters !== null && meters > maxMeters) return false;
  return true;
}

export function matchesMinRooms(
  prop: StatefoxSnapshotProperty,
  minRooms: number,
): boolean {
  if (minRooms <= 0) return true;
  const rooms = prop.pRooms ?? 0;
  if (rooms <= 0) return true;
  return rooms >= minRooms;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveZoneName(pZone: string | StatefoxPropertyZone | undefined): string {
  if (!pZone) return "";
  if (typeof pZone === "string") return pZone;
  return pZone.name ?? "";
}

/**
 * Normaliza keywords de localización desde el campo `zonas` de la demanda.
 * Aplica NFD + strip diacríticos para comparación robusta.
 */
export function normalizeLocationKeywords(zonas: string): string[] {
  if (!zonas || !zonas.trim()) return [];
  return zonas
    .split(",")
    .map((z) => normalizeForComparison(z))
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Función principal
// ---------------------------------------------------------------------------

/**
 * Busca propiedades en el inventario Statefox via /snapshot, filtrando
 * en memoria por los criterios de la demanda.
 *
 * Pensado para reemplazar el uso de GET /properties en matching/microsite,
 * que devolvía volumen insuficiente para filtrar.
 */
export async function searchSnapshotForDemand(
  demand: DemandFilterInput,
  options?: SnapshotSearchOptions,
): Promise<SnapshotSearchResult> {
  const maxPages = options?.maxPages ?? DEFAULT_MAX_PAGES;
  const targetResults = options?.targetResults ?? DEFAULT_TARGET_RESULTS;
  const listingType = options?.listingType ?? "sale";

  const client = options?.client ?? createStatefoxClient();
  const housing = mapTiposToHousing(demand.tipos);
  const locationKeywords = normalizeLocationKeywords(demand.zonas);
  const minPrice = demand.presupuestoMin > 0 ? demand.presupuestoMin : null;
  const maxPrice = demand.presupuestoMax > 0 ? demand.presupuestoMax : null;
  const minMeters = demand.metrosMin && demand.metrosMin > 0 ? demand.metrosMin : null;
  const maxMeters = demand.metrosMax && demand.metrosMax > 0 ? demand.metrosMax : null;
  const minRooms = demand.habitacionesMin ?? 0;

  const seen = new Set<string>();
  const properties: SnapshotMatchedProperty[] = [];
  let totalScanned = 0;
  let pagesScanned = 0;
  let cursor: string | undefined;
  let earlyExit = false;

  while (pagesScanned < maxPages) {
    let response;
    try {
      response = await getSnapshot(client, {
        items: ITEMS_PER_PAGE,
        type: listingType,
        status: "active",
        next: cursor,
      });
    } catch (err) {
      console.error(
        `[statefox:snapshot-search] Error en página ${pagesScanned + 1}: ${err instanceof Error ? err.message : String(err)}`,
      );
      break;
    }

    pagesScanned++;
    const entries = Object.entries(response.result ?? {});
    totalScanned += entries.length;

    for (const [id, prop] of entries) {
      if (seen.has(id)) continue;
      seen.add(id);

      if (!matchesPriceRange(prop, minPrice, maxPrice)) continue;
      if (!matchesHousing(prop, housing)) continue;
      if (!matchesCity(prop, locationKeywords)) continue;
      if (!matchesMetersRange(prop, minMeters, maxMeters)) continue;
      if (!matchesMinRooms(prop, minRooms)) continue;

      properties.push({ id, property: prop });
    }

    const nextCursor = response.meta?.next;
    if (!nextCursor || entries.length === 0) break;

    if (properties.length >= targetResults) {
      earlyExit = true;
      break;
    }

    cursor = nextCursor;
  }

  console.log(
    `[statefox:snapshot-search] housing=${housing} city=[${locationKeywords.join(",")}] ` +
    `price=[${minPrice ?? "∞"},${maxPrice ?? "∞"}] meters=[${minMeters ?? "∞"},${maxMeters ?? "∞"}] rooms≥${minRooms} ` +
    `→ ${properties.length} matches / ${totalScanned} scanned / ${pagesScanned} pages` +
    (earlyExit ? " (early exit)" : ""),
  );

  return { properties, totalScanned, pagesScanned, earlyExit };
}
