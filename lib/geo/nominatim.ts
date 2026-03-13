/**
 * Geocoding con Nominatim (OpenStreetMap).
 *
 * - Endpoint público: https://nominatim.openstreetmap.org/search
 * - Rate limit: 1 req/s (política de uso de Nominatim)
 * - Devuelve bounding box y opcionalmente GeoJSON del polígono real
 * - Caché en memoria para evitar llamadas repetidas
 */

import type { GeoPolygon, NominatimResponse, BoundingBox } from "./types";
import { bboxToPolygon, calculateCenter, estimateZoom } from "./format";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "UrusCapital-GeoModule/1.0 (inmobiliaria; geocoding-demandas)";

const cache = new Map<string, GeoPolygon | null>();

let lastRequestTime = 0;

async function throttle(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < 1100) {
    await new Promise((resolve) => setTimeout(resolve, 1100 - elapsed));
  }
  lastRequestTime = Date.now();
}

function buildSearchUrl(query: string, withPolygon: boolean): string {
  const params = new URLSearchParams({
    q: query,
    format: "json",
    limit: "1",
    countrycodes: "es",
    addressdetails: "1",
  });
  if (withPolygon) {
    params.set("polygon_geojson", "1");
  }
  return `${NOMINATIM_BASE}?${params.toString()}`;
}

function extractPolygonFromGeoJson(
  geojson: NominatimResponse["geojson"],
): { lat: number; lng: number }[] | null {
  if (!geojson) return null;

  if (geojson.type === "Polygon") {
    const ring = (geojson.coordinates as number[][][])[0];
    if (!ring || ring.length < 3) return null;
    return ring.map(([lon, lat]) => ({ lat, lng: lon }));
  }

  if (geojson.type === "MultiPolygon") {
    const polygons = geojson.coordinates as unknown as number[][][][];
    let largest: number[][][] | null = null;
    let maxLen = 0;
    for (const poly of polygons) {
      if (poly[0] && poly[0].length > maxLen) {
        maxLen = poly[0].length;
        largest = poly;
      }
    }
    if (!largest || !largest[0] || largest[0].length < 3) return null;
    return largest[0].map(([lon, lat]) => ({ lat, lng: lon }));
  }

  return null;
}

/**
 * Simplifica un polígono con muchos vértices para no enviar datos excesivos
 * a Inmovilla. Usa el algoritmo de Ramer-Douglas-Peucker.
 */
function simplifyPolygon(
  vertices: { lat: number; lng: number }[],
  maxPoints: number,
): { lat: number; lng: number }[] {
  if (vertices.length <= maxPoints) return vertices;

  let epsilon = 0.0001;
  let result = rdpSimplify(vertices, epsilon);
  while (result.length > maxPoints && epsilon < 0.1) {
    epsilon *= 2;
    result = rdpSimplify(vertices, epsilon);
  }
  return result;
}

function rdpSimplify(
  points: { lat: number; lng: number }[],
  epsilon: number,
): { lat: number; lng: number }[] {
  if (points.length < 3) return points;

  let maxDist = 0;
  let maxIdx = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = rdpSimplify(points.slice(0, maxIdx + 1), epsilon);
    const right = rdpSimplify(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }

  return [first, last];
}

function perpendicularDistance(
  point: { lat: number; lng: number },
  lineStart: { lat: number; lng: number },
  lineEnd: { lat: number; lng: number },
): number {
  const dx = lineEnd.lng - lineStart.lng;
  const dy = lineEnd.lat - lineStart.lat;
  const norm = Math.sqrt(dx * dx + dy * dy);
  if (norm === 0) return Math.sqrt((point.lng - lineStart.lng) ** 2 + (point.lat - lineStart.lat) ** 2);
  return Math.abs(dy * point.lng - dx * point.lat + lineEnd.lng * lineStart.lat - lineEnd.lat * lineStart.lng) / norm;
}

/**
 * Geocodifica una ubicación usando Nominatim (OSM).
 *
 * Intenta obtener el polígono real (GeoJSON) del resultado.
 * Si no hay polígono, usa el bounding box como fallback.
 * Los resultados se cachean en memoria.
 *
 * @param query Nombre de zona/barrio/ciudad (ej. "Villarrubia, Córdoba, España")
 * @param maxVertices Máximo de vértices del polígono simplificado (default: 50)
 */
export async function geocodeWithNominatim(
  query: string,
  maxVertices = 50,
): Promise<GeoPolygon | null> {
  const cacheKey = query.toLowerCase().trim();
  if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;

  await throttle();

  const url = buildSearchUrl(query, true);
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) {
    cache.set(cacheKey, null);
    return null;
  }

  const results = (await response.json()) as NominatimResponse[];
  if (!results || results.length === 0) {
    cache.set(cacheKey, null);
    return null;
  }

  const result = results[0];
  const geoVertices = extractPolygonFromGeoJson(result.geojson);

  let polygon: GeoPolygon;

  if (geoVertices && geoVertices.length >= 3) {
    const simplified = simplifyPolygon(geoVertices, maxVertices);
    polygon = {
      vertices: simplified,
      center: calculateCenter(simplified),
      zoom: estimateZoom(simplified),
    };
  } else {
    const [south, north, west, east] = result.boundingbox.map(Number);
    const bbox: BoundingBox = { south, west, north, east };
    polygon = bboxToPolygon(bbox);
  }

  cache.set(cacheKey, polygon);
  return polygon;
}

/**
 * Limpia la caché de geocoding (útil en tests).
 */
export function clearGeoCache(): void {
  cache.clear();
}

/**
 * Devuelve el tamaño actual de la caché.
 */
export function geoCacheSize(): number {
  return cache.size;
}
