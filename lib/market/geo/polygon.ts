/**
 * Utilidades de poligono en plano lat/lng.
 *
 * Convencion: arrays `[lng, lat]` (GeoJSON), salvo donde se indique
 * lo contrario. El nivel de precision esperado es ~6 decimales (suficiente
 * para Cordoba, ~10cm en superficie).
 *
 * Estas operaciones tratan lat/lng como coordenadas planares cartesianas;
 * para Cordoba (lat~37.9), la distorsion vs distancias geodesicas reales
 * es < 1% y aceptable para filtrado por barrio.
 */

export type LngLat = [number, number];
export type Polygon = LngLat[];

/**
 * Bounding box minimo de un poligono. Devuelve `null` si el poligono
 * esta vacio.
 */
export function polygonBbox(polygon: Polygon): {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
} | null {
  if (polygon.length === 0) return null;
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of polygon) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLng, minLat, maxLng, maxLat };
}

/**
 * Test ray-casting clasico. Devuelve true si el punto cae estrictamente
 * dentro del poligono (puntos sobre el borde son indeterminados, pero
 * en la practica son raros con coordenadas float).
 */
export function pointInPolygon(point: LngLat, polygon: Polygon): boolean {
  if (polygon.length < 3) return false;
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!;
    const [xj, yj] = polygon[j]!;
    const intersect =
      (yi > y) !== (yj > y) &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Valida un poligono dibujado por un usuario. Reglas:
 *  - >=3 puntos.
 *  - Cada punto en rango plausible (lat [-90,90], lng [-180,180]).
 *  - Sin NaN.
 *  - Para uso practico: todos los puntos dentro de un bbox razonable de
 *    la peninsula iberica (lat 35-44, lng -10..5) si `restrictToSpain=true`.
 */
export function validatePolygon(
  polygon: Polygon,
  options: { restrictToSpain?: boolean } = {},
): { valid: true } | { valid: false; reason: string } {
  if (!Array.isArray(polygon)) {
    return { valid: false, reason: "polygon no es array" };
  }
  if (polygon.length < 3) {
    return { valid: false, reason: "polygon requiere al menos 3 puntos" };
  }
  for (let i = 0; i < polygon.length; i++) {
    const point = polygon[i];
    if (!Array.isArray(point) || point.length !== 2) {
      return { valid: false, reason: `punto[${i}] no es [lng,lat]` };
    }
    const [lng, lat] = point;
    if (
      typeof lng !== "number" ||
      typeof lat !== "number" ||
      !Number.isFinite(lng) ||
      !Number.isFinite(lat)
    ) {
      return { valid: false, reason: `punto[${i}] tiene coordenadas no numericas` };
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return { valid: false, reason: `punto[${i}] fuera de rango global` };
    }
    if (options.restrictToSpain) {
      if (lat < 35 || lat > 44 || lng < -10 || lng > 5) {
        return {
          valid: false,
          reason: `punto[${i}] fuera de bbox peninsula iberica`,
        };
      }
    }
  }
  return { valid: true };
}
