/**
 * Computo de `MarketSnapshotIndex` por (city, housingType, operation).
 *
 * Materializa el estado actual del inventario activo en una proyeccion
 * optimizada para consultas: total de listings activos, rangos de precio,
 * mediana de precio y mediana de precio por metro.
 *
 * Modulo "pure-ish": no hace I/O directo, recibe una funcion `loadActive`
 * que devuelve los listings filtrados. El handler real le pasa una version
 * que consulta Prisma; los tests pasan datos sinteticos.
 *
 * Politica de calidad: solo se incluyen listings con `status = "active"` y
 * `qualityScore >= minQualityScore`. Listings con price null entran en el
 * total pero se excluyen del calculo de medianas (no participan en filtros
 * de rango). Esto se alinea con `docs/core-sistema-mercado.md` "Reglas de
 * normalizacion" → "price <= 0 no participa en filtros de rango pero
 * permanece en inventario tecnico".
 */

import type {
  MarketHousingType,
  MarketOperation,
} from "./types";

export interface SnapshotInputListing {
  price: number | null;
  pricePerMeter: number | null;
  qualityScore: number;
  status: string;
}

export interface SnapshotComputeOptions {
  city: string;
  housingType: MarketHousingType;
  operation: MarketOperation;
  /** Umbral minimo de calidad para entrar en el snapshot publico. */
  minQualityScore?: number;
  /** Inyectable para tests. */
  now?: Date;
}

export interface SnapshotResult {
  city: string;
  housingType: MarketHousingType;
  operation: MarketOperation;
  freshAt: Date;
  totalActive: number;
  priceMin: number | null;
  priceMax: number | null;
  priceMedian: number | null;
  ppmMedian: number | null;
}

const DEFAULT_MIN_QUALITY_SCORE = 0.4;

/**
 * Calcula la proyeccion de snapshot para un trio (city, housingType, operation).
 *
 * `listings` debe traerse ya filtrado por esos tres ejes; este modulo
 * agrega y media. Si la lista esta vacia, devuelve totales en 0 y rangos null.
 */
export function computeSnapshotIndex(
  listings: readonly SnapshotInputListing[],
  options: SnapshotComputeOptions,
): SnapshotResult {
  const minQuality = options.minQualityScore ?? DEFAULT_MIN_QUALITY_SCORE;
  const eligible = listings.filter(
    (l) => l.status === "active" && l.qualityScore >= minQuality,
  );

  const totalActive = eligible.length;

  const prices = eligible
    .map((l) => l.price)
    .filter((p): p is number => p != null && Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b);

  const ppms = eligible
    .map((l) => l.pricePerMeter)
    .filter((p): p is number => p != null && Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b);

  return {
    city: options.city,
    housingType: options.housingType,
    operation: options.operation,
    freshAt: options.now ?? new Date(),
    totalActive,
    priceMin: prices.length > 0 ? prices[0]! : null,
    priceMax: prices.length > 0 ? prices[prices.length - 1]! : null,
    priceMedian: median(prices),
    ppmMedian: median(ppms),
  };
}

function median(sortedValues: readonly number[]): number | null {
  const n = sortedValues.length;
  if (n === 0) return null;
  if (n % 2 === 1) return sortedValues[(n - 1) / 2]!;
  const mid = n / 2;
  return round2((sortedValues[mid - 1]! + sortedValues[mid]!) / 2);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
