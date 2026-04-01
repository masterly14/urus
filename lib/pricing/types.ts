/**
 * Tipos del Motor de Pricing v1 (M7).
 *
 * Flujo: PropertyCurrent (Neon) → extracción → Statefox API → cluster → análisis.
 */

import type { StatefoxHousing, StatefoxListingType } from "@/lib/statefox/types";
import type { PricingRecommendation } from "./recommendation-types";

// ---------------------------------------------------------------------------
// Input: variables extraídas del inmueble en Neon
// ---------------------------------------------------------------------------

export interface PricingPropertyInput {
  propertyCode: string;
  precio: number;
  precioM2: number;
  metrosConstruidos: number;
  habitaciones: number;
  banyos: number;
  ciudad: string;
  zona: string;
  /** Nombre textual de tipología (ej. "Piso", "Chalet"). Resuelto desde key_tipo. */
  tipologiaNombre: string;
  /** key_tipo numérico original de Inmovilla (como string en PropertyCurrent.tipoOfer). */
  keyTipo: number | null;
  tipoOperacion: StatefoxListingType;
  estado: string;
  extras: PricingPropertyExtras;
}

export interface PricingPropertyExtras {
  terraza: boolean;
  garaje: boolean;
  ascensor: boolean;
  trastero: boolean;
  piscina: boolean;
  aireAcondicionado: boolean;
  calefaccion: string | null;
  anoConstruccion: string | null;
  certificadoEnergetico: string | null;
}

// ---------------------------------------------------------------------------
// Comparable: propiedad de Statefox normalizada para pricing
// ---------------------------------------------------------------------------

export interface PricingComparable {
  statefoxId: string;
  precio: number;
  precioM2: number;
  metrosConstruidos: number;
  habitaciones: number;
  banyos: number;
  ciudad: string;
  zona: string;
  tipologia: string;
  advertiserType: "private" | "professional" | "unknown";
  extras: Partial<PricingPropertyExtras>;
  link: string | null;
  diasPublicado: number | null;
}

// ---------------------------------------------------------------------------
// Estadísticas del cluster
// ---------------------------------------------------------------------------

export type SemaforoStatus = "verde" | "amarillo" | "rojo" | "sin_datos";

export interface PricingClusterStats {
  totalComparables: number;
  precioMedioM2: number;
  precioMedianaM2: number;
  precioMinM2: number;
  precioMaxM2: number;
  desviacionEstandar: number;
  precioMedioM2Particular: number | null;
  precioMedioM2Profesional: number | null;
  gapPorcentaje: number;
  semaforo: SemaforoStatus;
}

// ---------------------------------------------------------------------------
// Resultado completo del análisis
// ---------------------------------------------------------------------------

export interface PricingAnalysisResult {
  propertyCode: string;
  input: PricingPropertyInput;
  comparables: PricingComparable[];
  stats: PricingClusterStats;
  analyzedAt: string;
  queryMeta: {
    endpoint: "snapshot" | "properties";
    housing: StatefoxHousing;
    type: StatefoxListingType;
    pagesScanned: number;
    totalResultsFromAPI: number;
    filteredResults: number;
  };
  recommendation?: PricingRecommendation;
  recommendationError?: string;
}

// ---------------------------------------------------------------------------
// Opciones del motor
// ---------------------------------------------------------------------------

export interface PricingOptions {
  priceRangePercent?: number;
  metersRangePercent?: number;
  /** Máximo de páginas de /snapshot a recorrer (250 props/pág). Default 30. */
  maxPages?: number;
  /** Mínimo de comparables antes de dejar de paginar. Default 5. */
  minComparables?: number;
  /** Invocar motor de recomendación LangGraph tras el análisis estadístico. Default true. */
  generateRecommendation?: boolean;
}

// ---------------------------------------------------------------------------
// Error tipado para datos incompletos
// ---------------------------------------------------------------------------

export class PricingDataIncompleteError extends Error {
  public readonly missingFields: string[];
  constructor(propertyCode: string, missingFields: string[]) {
    super(
      `Datos incompletos para pricing del inmueble ${propertyCode}: faltan ${missingFields.join(", ")}`,
    );
    this.name = "PricingDataIncompleteError";
    this.missingFields = missingFields;
  }
}
