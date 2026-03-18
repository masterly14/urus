/**
 * Traductor demanda → filtros Statefox.
 *
 * Capa de traducción entre el modelo de demanda de Inmovilla y los filtros
 * de la API REST de Statefox. Divide la lógica en dos pasos:
 *   1. buildStatefoxQuery()  — produce los query params para GET /properties.
 *   2. matchesStatefoxFilters() — filtra en memoria los resultados por precio,
 *      metros, ciudad y zona (campos que la API no soporta como query params).
 */

import type { StatefoxHousing, StatefoxListingType, StatefoxSource, StatefoxProperty } from "./types";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface DemandFilterInput {
  /** Tipos de inmueble separados por coma. Ej: "Piso, Ático, Dúplex" */
  tipos: string;
  /** Zonas/barrios separados por coma. Ej: "Centro, Norte, La Flota" */
  zonas: string;
  /** Precio mínimo en €. 0 = sin límite inferior. */
  presupuestoMin: number;
  /** Precio máximo en €. 0 = sin límite superior. */
  presupuestoMax: number;
  /** Habitaciones mínimas. 0 = sin límite. */
  habitacionesMin: number;
  /** Metros mínimos construidos. 0 = sin límite. */
  metrosMin?: number;
  /** Metros máximos construidos. 0 = sin límite. */
  metrosMax?: number;
}

export interface StatefoxQueryParams {
  /** Tipo de inmueble mapeado al vocabulario de Statefox. */
  housing: StatefoxHousing;
  /** Operación: venta o alquiler. */
  type: StatefoxListingType;
  /** Portal de donde extraer datos. */
  source: StatefoxSource;
  /** Número máximo de resultados (1-500). */
  items: number;
}

export interface StatefoxResultFilters {
  minPrice: number | null;
  maxPrice: number | null;
  minMeters: number | null;
  maxMeters: number | null;
  /** Nombres de ciudad/zona para filtrado por texto. Vacío = sin filtro. */
  locationKeywords: string[];
}

export interface StatefoxDemandQuery {
  queryParams: StatefoxQueryParams;
  resultFilters: StatefoxResultFilters;
}

// ---------------------------------------------------------------------------
// Mapa de tipología Inmovilla → StatefoxHousing
// ---------------------------------------------------------------------------

const TIPO_TO_HOUSING: Record<string, StatefoxHousing> = {
  // Pisos y apartamentos
  piso: "flat",
  apartamento: "flat",
  estudio: "studio",
  loft: "loft",
  // Áticos y similares
  "ático": "penthouse",
  atico: "penthouse",
  ático: "penthouse",
  penthouse: "penthouse",
  // Casas y unifamiliares
  chalet: "house",
  casa: "house",
  unifamiliar: "house",
  adosado: "house",
  pareado: "house",
  bungalow: "house",
  villa: "house",
  finca: "countryhouse",
  cortijo: "countryhouse",
  // Dúplex
  "dúplex": "duplex",
  duplex: "duplex",
  // Comercial
  local: "premises",
  oficina: "office",
  nave: "warehouse",
  almacén: "storage",
  almacen: "storage",
  trastero: "storage",
  garaje: "garage",
  parking: "garage",
  // Terrenos
  solar: "land",
  terreno: "land",
  parcela: "land",
  // Edificios
  edificio: "building",
  hotel: "building",
  // Habitaciones
  "habitación": "room",
  habitacion: "room",
};

/**
 * Normaliza un string de tipo: minúsculas, sin tildes.
 */
function normalizeTipo(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Mapea una lista de tipos Inmovilla al primer housing Statefox reconocido.
 * Si ninguno coincide, devuelve "flat" como fallback razonable.
 */
export function mapTiposToHousing(tipos: string): StatefoxHousing {
  if (!tipos || !tipos.trim()) return "flat";

  const list = tipos.split(",").map((t) => normalizeTipo(t));

  for (const t of list) {
    // Búsqueda exacta primero
    if (TIPO_TO_HOUSING[t]) return TIPO_TO_HOUSING[t];
    // Búsqueda por prefijo/substring
    const match = Object.keys(TIPO_TO_HOUSING).find((key) => t.includes(key) || key.includes(t));
    if (match) return TIPO_TO_HOUSING[match];
  }

  return "flat";
}

/**
 * Extrae keywords de localización (ciudad/zona) desde el campo `zonas`.
 * El campo puede contener nombres de zona, ciudad, o combinados con comas.
 */
export function parseLocationKeywords(zonas: string): string[] {
  if (!zonas || !zonas.trim()) return [];
  return zonas
    .split(",")
    .map((z) => z.trim().toLowerCase())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Función principal: buildStatefoxQuery
// ---------------------------------------------------------------------------

/**
 * Construye el objeto de consulta Statefox a partir de los datos de una demanda.
 *
 * @param demand  Datos de la demanda (proyección actual).
 * @param options Overrides opcionales (source, type, items).
 */
export function buildStatefoxQuery(
  demand: DemandFilterInput,
  options?: {
    source?: StatefoxSource;
    type?: StatefoxListingType;
    items?: number;
  },
): StatefoxDemandQuery {
  const housing = mapTiposToHousing(demand.tipos);
  const locationKeywords = parseLocationKeywords(demand.zonas);

  const queryParams: StatefoxQueryParams = {
    housing,
    type: options?.type ?? "sale",
    source: options?.source ?? "idealista",
    items: options?.items ?? 50,
  };

  const resultFilters: StatefoxResultFilters = {
    minPrice: demand.presupuestoMin > 0 ? demand.presupuestoMin : null,
    maxPrice: demand.presupuestoMax > 0 ? demand.presupuestoMax : null,
    minMeters: demand.metrosMin && demand.metrosMin > 0 ? demand.metrosMin : null,
    maxMeters: demand.metrosMax && demand.metrosMax > 0 ? demand.metrosMax : null,
    locationKeywords,
  };

  return { queryParams, resultFilters };
}

// ---------------------------------------------------------------------------
// matchesStatefoxFilters: filtrado de resultados en memoria
// ---------------------------------------------------------------------------

/**
 * Evalúa si una propiedad Statefox cumple los filtros de resultado de la demanda.
 * Aplica precio, metros y coincidencia de ciudad/zona.
 */
export function matchesStatefoxFilters(
  property: StatefoxProperty,
  filters: StatefoxResultFilters,
): boolean {
  // --- Precio ---
  const price = property.pPrice ?? null;
  if (price !== null) {
    if (filters.minPrice !== null && price < filters.minPrice) return false;
    if (filters.maxPrice !== null && price > filters.maxPrice) return false;
  }

  // --- Metros ---
  const meters = property.pMeters?.built ?? null;
  if (meters !== null && meters > 0) {
    if (filters.minMeters !== null && meters < filters.minMeters) return false;
    if (filters.maxMeters !== null && meters > filters.maxMeters) return false;
  }

  // --- Ciudad / Zona ---
  if (filters.locationKeywords.length > 0) {
    const cityName = (property.pCity?.cityName ?? "").toLowerCase();
    const zoneName = (property.pZone?.name ?? "").toLowerCase();
    const address = (property.pAddress ?? "").toLowerCase();

    const matchesLocation = filters.locationKeywords.some(
      (kw) => cityName.includes(kw) || zoneName.includes(kw) || address.includes(kw),
    );

    if (!matchesLocation) return false;
  }

  return true;
}

/**
 * Filtra una lista de propiedades Statefox según los ResultFilters de la demanda.
 */
export function filterStatefoxResults(
  properties: StatefoxProperty[],
  filters: StatefoxResultFilters,
): StatefoxProperty[] {
  return properties.filter((p) => matchesStatefoxFilters(p, filters));
}
