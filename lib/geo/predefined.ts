/**
 * Polígonos predefinidos para ciudades y zonas operativas de Urus Capital.
 *
 * Estrategia MVP: polígonos de bounding box ampliados para las ciudades y
 * barrios/distritos donde opera la agencia (Córdoba, Málaga, Sevilla).
 * Estos polígonos se usan como fallback rápido cuando no se necesita geocoding
 * dinámico o cuando el rate limit de Nominatim es un problema.
 *
 * Coordenadas verificadas contra OpenStreetMap.
 * Cada entrada mapea un identificador textual normalizado a un GeoPolygon.
 */

import type { GeoPolygon } from "./types";

type PredefinedEntry = {
  polygon: GeoPolygon;
  aliases: string[];
  keyLoca?: number;
};

// ─── Córdoba capital y zonas ─────────────────────────────────────────────────

const CORDOBA_CAPITAL: GeoPolygon = {
  vertices: [
    { lat: 37.840, lng: -4.850 },
    { lat: 37.920, lng: -4.850 },
    { lat: 37.920, lng: -4.720 },
    { lat: 37.840, lng: -4.720 },
  ],
  center: { lat: 37.880, lng: -4.785 },
  zoom: 13,
};

const CORDOBA_CENTRO: GeoPolygon = {
  vertices: [
    { lat: 37.876, lng: -4.790 },
    { lat: 37.893, lng: -4.790 },
    { lat: 37.893, lng: -4.765 },
    { lat: 37.876, lng: -4.765 },
  ],
  center: { lat: 37.885, lng: -4.778 },
  zoom: 15,
};

const CORDOBA_NORTE: GeoPolygon = {
  vertices: [
    { lat: 37.893, lng: -4.805 },
    { lat: 37.915, lng: -4.805 },
    { lat: 37.915, lng: -4.760 },
    { lat: 37.893, lng: -4.760 },
  ],
  center: { lat: 37.904, lng: -4.783 },
  zoom: 14,
};

const CORDOBA_SUR: GeoPolygon = {
  vertices: [
    { lat: 37.855, lng: -4.800 },
    { lat: 37.876, lng: -4.800 },
    { lat: 37.876, lng: -4.760 },
    { lat: 37.855, lng: -4.760 },
  ],
  center: { lat: 37.866, lng: -4.780 },
  zoom: 14,
};

const CORDOBA_LEVANTE: GeoPolygon = {
  vertices: [
    { lat: 37.870, lng: -4.760 },
    { lat: 37.900, lng: -4.760 },
    { lat: 37.900, lng: -4.720 },
    { lat: 37.870, lng: -4.720 },
  ],
  center: { lat: 37.885, lng: -4.740 },
  zoom: 14,
};

const CORDOBA_PONIENTE: GeoPolygon = {
  vertices: [
    { lat: 37.870, lng: -4.850 },
    { lat: 37.900, lng: -4.850 },
    { lat: 37.900, lng: -4.800 },
    { lat: 37.870, lng: -4.800 },
  ],
  center: { lat: 37.885, lng: -4.825 },
  zoom: 14,
};

// ─── Málaga capital y zonas ──────────────────────────────────────────────────

const MALAGA_CAPITAL: GeoPolygon = {
  vertices: [
    { lat: 36.680, lng: -4.480 },
    { lat: 36.760, lng: -4.480 },
    { lat: 36.760, lng: -4.360 },
    { lat: 36.680, lng: -4.360 },
  ],
  center: { lat: 36.720, lng: -4.420 },
  zoom: 13,
};

const MALAGA_CENTRO: GeoPolygon = {
  vertices: [
    { lat: 36.710, lng: -4.435 },
    { lat: 36.728, lng: -4.435 },
    { lat: 36.728, lng: -4.410 },
    { lat: 36.710, lng: -4.410 },
  ],
  center: { lat: 36.719, lng: -4.423 },
  zoom: 15,
};

const MALAGA_ESTE: GeoPolygon = {
  vertices: [
    { lat: 36.700, lng: -4.410 },
    { lat: 36.740, lng: -4.410 },
    { lat: 36.740, lng: -4.360 },
    { lat: 36.700, lng: -4.360 },
  ],
  center: { lat: 36.720, lng: -4.385 },
  zoom: 14,
};

const MALAGA_OESTE: GeoPolygon = {
  vertices: [
    { lat: 36.700, lng: -4.480 },
    { lat: 36.740, lng: -4.480 },
    { lat: 36.740, lng: -4.435 },
    { lat: 36.700, lng: -4.435 },
  ],
  center: { lat: 36.720, lng: -4.458 },
  zoom: 14,
};

const MALAGA_TEATINOS: GeoPolygon = {
  vertices: [
    { lat: 36.715, lng: -4.475 },
    { lat: 36.735, lng: -4.475 },
    { lat: 36.735, lng: -4.450 },
    { lat: 36.715, lng: -4.450 },
  ],
  center: { lat: 36.725, lng: -4.463 },
  zoom: 15,
};

// ─── Sevilla capital y zonas ─────────────────────────────────────────────────

const SEVILLA_CAPITAL: GeoPolygon = {
  vertices: [
    { lat: 37.340, lng: -6.030 },
    { lat: 37.420, lng: -6.030 },
    { lat: 37.420, lng: -5.900 },
    { lat: 37.340, lng: -5.900 },
  ],
  center: { lat: 37.380, lng: -5.965 },
  zoom: 13,
};

const SEVILLA_CENTRO: GeoPolygon = {
  vertices: [
    { lat: 37.378, lng: -5.998 },
    { lat: 37.398, lng: -5.998 },
    { lat: 37.398, lng: -5.980 },
    { lat: 37.378, lng: -5.980 },
  ],
  center: { lat: 37.388, lng: -5.989 },
  zoom: 15,
};

const SEVILLA_TRIANA: GeoPolygon = {
  vertices: [
    { lat: 37.374, lng: -6.012 },
    { lat: 37.395, lng: -6.012 },
    { lat: 37.395, lng: -5.998 },
    { lat: 37.374, lng: -5.998 },
  ],
  center: { lat: 37.384, lng: -6.005 },
  zoom: 15,
};

const SEVILLA_NERVION: GeoPolygon = {
  vertices: [
    { lat: 37.376, lng: -5.980 },
    { lat: 37.396, lng: -5.980 },
    { lat: 37.396, lng: -5.955 },
    { lat: 37.376, lng: -5.955 },
  ],
  center: { lat: 37.386, lng: -5.968 },
  zoom: 15,
};

const SEVILLA_MACARENA: GeoPolygon = {
  vertices: [
    { lat: 37.398, lng: -5.998 },
    { lat: 37.418, lng: -5.998 },
    { lat: 37.418, lng: -5.970 },
    { lat: 37.398, lng: -5.970 },
  ],
  center: { lat: 37.408, lng: -5.984 },
  zoom: 14,
};

// ─── Registro central ────────────────────────────────────────────────────────

const entries: PredefinedEntry[] = [
  {
    polygon: CORDOBA_CAPITAL,
    aliases: ["córdoba", "cordoba", "córdoba capital"],
  },
  { polygon: CORDOBA_CENTRO, aliases: ["córdoba centro", "cordoba centro", "centro córdoba"] },
  { polygon: CORDOBA_NORTE, aliases: ["córdoba norte", "cordoba norte", "norte córdoba", "brillante", "el brillante"] },
  { polygon: CORDOBA_SUR, aliases: ["córdoba sur", "cordoba sur", "sur córdoba", "sector sur"] },
  { polygon: CORDOBA_LEVANTE, aliases: ["córdoba levante", "cordoba levante", "levante", "córdoba este", "cordoba este"] },
  { polygon: CORDOBA_PONIENTE, aliases: ["córdoba poniente", "cordoba poniente", "poniente", "córdoba oeste", "cordoba oeste"] },
  {
    polygon: MALAGA_CAPITAL,
    aliases: ["málaga", "malaga", "málaga capital"],
  },
  { polygon: MALAGA_CENTRO, aliases: ["málaga centro", "malaga centro", "centro málaga"] },
  { polygon: MALAGA_ESTE, aliases: ["málaga este", "malaga este", "este málaga", "el palo", "pedregalejo"] },
  { polygon: MALAGA_OESTE, aliases: ["málaga oeste", "malaga oeste", "oeste málaga", "huelin", "carretera de cádiz"] },
  { polygon: MALAGA_TEATINOS, aliases: ["teatinos", "málaga teatinos", "malaga teatinos"] },
  {
    polygon: SEVILLA_CAPITAL,
    aliases: ["sevilla", "sevilla capital"],
  },
  { polygon: SEVILLA_CENTRO, aliases: ["sevilla centro", "centro sevilla"] },
  { polygon: SEVILLA_TRIANA, aliases: ["triana", "sevilla triana"] },
  { polygon: SEVILLA_NERVION, aliases: ["nervión", "nervion", "sevilla nervión", "sevilla nervion"] },
  { polygon: SEVILLA_MACARENA, aliases: ["macarena", "sevilla macarena", "la macarena"] },
];

const aliasMap = new Map<string, GeoPolygon>();
for (const entry of entries) {
  for (const alias of entry.aliases) {
    aliasMap.set(alias.toLowerCase(), entry.polygon);
  }
}

/**
 * Busca un polígono predefinido por nombre de zona/ciudad (case-insensitive).
 * Retorna `undefined` si no hay match.
 */
export function findPredefinedPolygon(zoneText: string): GeoPolygon | undefined {
  return aliasMap.get(zoneText.toLowerCase().trim());
}

/**
 * Devuelve todos los aliases registrados (útil para debug/tests).
 */
export function listPredefinedAliases(): string[] {
  return Array.from(aliasMap.keys());
}
