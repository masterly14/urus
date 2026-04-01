/**
 * Análisis estadístico del cluster comparativo para pricing.
 *
 * Calcula precio medio/mediana/desviación €/m², segmenta por tipo de anunciante
 * (particular vs profesional) y asigna semáforo de posicionamiento.
 *
 * Umbrales confirmados: VERDE ≤5%, AMARILLO 5-12%, ROJO >12%.
 */

import type { PricingPropertyInput, PricingComparable, PricingClusterStats, SemaforoStatus } from "./types";

const SEMAFORO_VERDE_MAX = 5;
const SEMAFORO_AMARILLO_MAX = 12;

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stddev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function assignSemaforo(gapAbsolute: number): SemaforoStatus {
  if (gapAbsolute <= SEMAFORO_VERDE_MAX) return "verde";
  if (gapAbsolute <= SEMAFORO_AMARILLO_MAX) return "amarillo";
  return "rojo";
}

function averageByType(
  comparables: PricingComparable[],
  type: "private" | "professional",
): number | null {
  const subset = comparables.filter((c) => c.advertiserType === type && c.precioM2 > 0);
  if (subset.length === 0) return null;
  return Math.round(mean(subset.map((c) => c.precioM2)));
}

export function analyzeCluster(
  input: PricingPropertyInput,
  comparables: PricingComparable[],
): PricingClusterStats {
  const preciosM2 = comparables
    .map((c) => c.precioM2)
    .filter((p) => p > 0)
    .sort((a, b) => a - b);

  if (preciosM2.length === 0) {
    return {
      totalComparables: 0,
      precioMedioM2: 0,
      precioMedianaM2: 0,
      precioMinM2: 0,
      precioMaxM2: 0,
      desviacionEstandar: 0,
      precioMedioM2Particular: null,
      precioMedioM2Profesional: null,
      gapPorcentaje: 0,
      semaforo: "sin_datos",
    };
  }

  const precioMedioM2 = Math.round(mean(preciosM2));
  const precioMedianaM2 = Math.round(median(preciosM2));
  const precioMinM2 = preciosM2[0];
  const precioMaxM2 = preciosM2[preciosM2.length - 1];
  const desviacionEstandar = Math.round(stddev(preciosM2, precioMedioM2) * 100) / 100;

  const ownPriceM2 = input.precioM2;
  const gapPorcentaje = precioMedioM2 > 0
    ? Math.round(((ownPriceM2 - precioMedioM2) / precioMedioM2) * 10000) / 100
    : 0;

  const semaforo = assignSemaforo(Math.abs(gapPorcentaje));

  return {
    totalComparables: comparables.length,
    precioMedioM2,
    precioMedianaM2,
    precioMinM2,
    precioMaxM2,
    desviacionEstandar,
    precioMedioM2Particular: averageByType(comparables, "private"),
    precioMedioM2Profesional: averageByType(comparables, "professional"),
    gapPorcentaje,
    semaforo,
  };
}
