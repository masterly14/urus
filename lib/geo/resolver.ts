/**
 * Resolución de polígonos para demandas.
 *
 * Estrategia de resolución (cascada):
 * 1. Polígonos predefinidos (instantáneo, sin I/O)
 * 2. Geocoding con Nominatim/OSM (1 req/s, caché en memoria)
 * 3. Fallback: bounding box genérico de la ciudad operativa más cercana
 *
 * Para integración con enums REST de Inmovilla: se puede resolver por
 * key_zona (obtener el nombre de zona vía API REST → luego resolver).
 */

import type { GeoPolygon, GeoResolutionResult, InmovillaGeoFields } from "./types";
import { findPredefinedPolygon } from "./predefined";
import { geocodeWithNominatim } from "./nominatim";
import { polygonToInmovillaFields } from "./format";

export type ResolveGeoOptions = {
  /** Nombre de zona/barrio/municipio en texto libre */
  zoneText?: string;
  /** Nombre de la ciudad (contexto para geocoding) */
  city?: string;
  /** Provincia (contexto adicional para geocoding) */
  province?: string;
  /** Desactivar Nominatim (solo predefinidos) */
  offlineOnly?: boolean;
};

/**
 * Resuelve un polígono geoespacial para una demanda.
 *
 * @example
 * // 1. Con texto de zona conocida
 * const result = await resolveGeoPolygon({ zoneText: "Córdoba centro" });
 *
 * // 2. Con zona + ciudad para contexto
 * const result = await resolveGeoPolygon({ zoneText: "Villarrubia", city: "Córdoba" });
 *
 * // 3. Solo ciudad
 * const result = await resolveGeoPolygon({ city: "Málaga" });
 *
 * // 4. Modo offline (solo predefinidos)
 * const result = await resolveGeoPolygon({ zoneText: "Triana", offlineOnly: true });
 */
export async function resolveGeoPolygon(
  options: ResolveGeoOptions,
): Promise<GeoResolutionResult | null> {
  const { zoneText, city, province, offlineOnly } = options;

  const zoneCandidates = buildZoneCandidates(zoneText, city);
  const fallbackCandidates = buildFallbackCandidates(city, province);

  for (const candidate of zoneCandidates) {
    const predefined = findPredefinedPolygon(candidate);
    if (predefined) {
      return { polygon: predefined, source: "predefined", label: candidate };
    }
  }

  if (!offlineOnly) {
    const allCandidates = [...zoneCandidates, ...fallbackCandidates];
    for (const candidate of allCandidates) {
      const nominatimQuery = buildNominatimQuery(candidate, city, province);
      const polygon = await geocodeWithNominatim(nominatimQuery);
      if (polygon) {
        return { polygon, source: "nominatim", label: candidate };
      }
    }
  }

  for (const candidate of fallbackCandidates) {
    const predefined = findPredefinedPolygon(candidate);
    if (predefined) {
      return { polygon: predefined, source: "fallback-bbox", label: candidate };
    }
  }

  return null;
}

/**
 * Candidatos específicos de zona (no incluye la ciudad sola).
 * Si solo se pasa city sin zoneText, la ciudad sí entra aquí.
 */
function buildZoneCandidates(zoneText?: string, city?: string): string[] {
  const candidates: string[] = [];

  if (zoneText) {
    candidates.push(zoneText);
    if (city) {
      candidates.push(`${city} ${zoneText}`);
      candidates.push(`${zoneText} ${city}`);
    }
  } else if (city) {
    candidates.push(city);
  }

  return [...new Set(candidates.map((c) => c.toLowerCase().trim()))];
}

/**
 * Candidatos de fallback: la ciudad y provincia como último recurso.
 * Solo se usan cuando la zona específica no se resuelve.
 */
function buildFallbackCandidates(city?: string, province?: string): string[] {
  const candidates: string[] = [];
  if (city) candidates.push(city);
  if (province && province !== city) candidates.push(province);
  return [...new Set(candidates.map((c) => c.toLowerCase().trim()))];
}

function buildNominatimQuery(
  candidate: string,
  city?: string,
  province?: string,
): string {
  const parts = [candidate];

  const candidateLower = candidate.toLowerCase();
  if (city && !candidateLower.includes(city.toLowerCase())) {
    parts.push(city);
  }
  if (province && !candidateLower.includes(province.toLowerCase())) {
    parts.push(province);
  }
  parts.push("España");

  return parts.join(", ");
}

/**
 * Resuelve un polígono y lo convierte directamente a los campos que
 * necesita guardar.php de Inmovilla. Devuelve null si no se pudo resolver.
 */
export async function resolveGeoFields(
  options: ResolveGeoOptions,
): Promise<{ fields: InmovillaGeoFields; resolution: GeoResolutionResult } | null> {
  const resolution = await resolveGeoPolygon(options);
  if (!resolution) return null;
  return {
    fields: polygonToInmovillaFields(resolution.polygon),
    resolution,
  };
}

/**
 * Genera los campos geográficos vacíos para demandas sin zona geoespacial.
 * Útil como fallback cuando no hay polígono disponible.
 */
export function emptyGeoFields(): InmovillaGeoFields {
  return {
    "selpoli-selpoli": "",
    poli: "",
    "demandas-centrolatitud": "0",
    "demandas-centroaltitud": "0",
    "demandas-zoom": "14",
    "demandas-porarea": "1",
  };
}
