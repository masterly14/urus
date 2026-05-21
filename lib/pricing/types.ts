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
  zonaRaw: string;
  keyLoca: number | null;
  keyZona: number | null;
  /** Nombre textual de tipología (ej. "Piso", "Chalet"). Resuelto desde key_tipo. */
  tipologiaNombre: string;
  /** key_tipo numérico original de Inmovilla (como string en PropertyCurrent.tipoOfer). */
  keyTipo: number | null;
  tipoOperacion: StatefoxListingType;
  estado: string;
  fechaAlta: string | null;
  fechaActualizacion: string | null;
  latitud: number | null;
  longitud: number | null;
  extras: PricingPropertyExtras;
}

export type ComparabilityResolutionMethod =
  | "key_zona"
  | "alias"
  | "canonical_name"
  | "unknown";

export type ComparabilityConfidenceLevel = "high" | "medium" | "low";

export interface ComparabilityRelationRule {
  toZoneCode: string;
  strength: "strong" | "medium" | "weak";
  reason: string | null;
}

export interface PropertyComparabilityProfile {
  propertyCode: string;
  catalogVersion: string;
  resolutionMethod: ComparabilityResolutionMethod;
  confidenceLevel: ComparabilityConfidenceLevel;
  confidenceFlags: string[];
  zoneRaw: string;
  zoneCode: string | null;
  zoneNameCanonical: string | null;
  keyLoca: number | null;
  keyZona: number | null;
  macroArea: "Centro" | "Norte" | "Sur" | "Este" | "Oeste" | "Sierra" | "Periurbano" | null;
  marketSegment: "popular" | "medio" | "medio_alto" | "premium" | null;
  qualityProfile: "basico" | "medio" | "alto" | null;
  pricingProfileStatus:
    | "ready"
    | "heuristic"
    | "not_ready"
    | "redirected"
    | "not_applicable"
    | "deprecated"
    | "unknown";
  coverageStatus:
    | "validated"
    | "known_unprofiled"
    | "redirected"
    | "out_of_scope"
    | "deprecated"
    | "unknown";
  comparableRadiusMode: "intra_zone_only" | "zone_plus_mirrors" | "dynamic" | null;
  allowedZoneCodes: string[];
  excludedZoneCodes: string[];
  comparableRelations: ComparabilityRelationRule[];
  excludedRelations: ComparabilityRelationRule[];
  priceBandM2Min: number | null;
  priceBandM2Max: number | null;
  builtAt: string;
}

export type ComparableDecision = "included" | "excluded";

export type ComparableDecisionReason =
  | "NO_COMPARABILITY_PROFILE"
  | "ZONE_INCLUDED_READY"
  | "ZONE_INCLUDED_HEURISTIC"
  | "ZONE_INCLUDED_FALLBACK"
  | "ZONE_EXCLUDED_NOT_COMPARABLE"
  | "ZONE_NOT_ALLOWED"
  | "ZONE_UNKNOWN_FALLBACK";

export interface ComparableDecisionTrace {
  statefoxId: string;
  candidateZoneRaw: string;
  candidateZoneCodeResolved: string | null;
  decision: ComparableDecision;
  reason: ComparableDecisionReason;
}

export interface PricingComparabilityMeta {
  comparabilityFilterApplied: boolean;
  effectiveAllowedZoneCodes: string[];
  effectiveExcludedZoneCodes: string[];
  candidatesBeforeFilter: number;
  candidatesAfterFilter: number;
  excludedByReason: Record<string, number>;
  comparableDecisions: ComparableDecisionTrace[];
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

export interface PricingComparableAdvertiser {
  nombre: string | null;
  tipo: "private" | "professional" | "unknown";
  telefonos: string[];
}

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
  descripcion: string | null;
  direccion: string | null;
  fotos: string[];
  imageCacheStatus?: "PENDING" | "IMPORTED" | "FAILED" | "BLOCKED" | "CAPTCHA" | "LISTING_REMOVED" | "NO_IMAGES_FOUND";
  anunciante: PricingComparableAdvertiser;
  latitud: number | null;
  longitud: number | null;
  planta: string | null;
  orientacion: string | null;
  referencia: string | null;
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

export type PricingMarketTempo = "caliente" | "estable" | "lento" | "sin_datos";
export type PricingListingMomentum = "nuevo" | "maduro" | "estancado" | "sin_datos";
export type PricingTrendPressure = "baja" | "media" | "alta" | "sin_datos";

export interface PricingTrendSummary {
  propertyAgeDays: number | null;
  lastUpdatedDays: number | null;
  comparableAverageDaysPublished: number | null;
  comparableMedianDaysPublished: number | null;
  freshComparablesShare: number | null;
  staleComparablesShare: number | null;
  marketTempo: PricingMarketTempo;
  listingMomentum: PricingListingMomentum;
  pressure: PricingTrendPressure;
  summary: string;
}

export type DensityBucket = "baja" | "media" | "alta" | "muy_alta" | "sin_datos";

export interface ZoneDemographicsSummary {
  available: boolean;
  city: string;
  districtCode: string | null;
  districtName: string | null;
  zoneCode: string | null;
  zoneName: string | null;
  population: number | null;
  surfaceKm2: number | null;
  densityPerKm2: number | null;
  densityBucket: DensityBucket;
  year: number | null;
  source: string | null;
}

export interface ZonePoiSummaryItem {
  name: string;
  rating: number | null;
  lat: number;
  lng: number;
  address: string | null;
}

export interface ZoneTravelModeSummary {
  mode: "driving" | "transit" | "walking";
  destinations: number;
  minutesP50: number | null;
  minutesP90: number | null;
  distanceKmP50: number | null;
}

export interface ZoneStudySummary {
  transportSummary: {
    totalStops: number;
    topStops: ZonePoiSummaryItem[];
  };
  schoolsSummary: {
    totalSchools: number;
    topSchools: ZonePoiSummaryItem[];
    avgSchoolRating: number | null;
  };
  travelTimeSummary: {
    byMode: ZoneTravelModeSummary[];
    accessibilityScore: number | null;
  };
  demographicsSummary: ZoneDemographicsSummary;
}

export interface OptimalPricingSummary {
  comparablesUsed: number;
  minPriceM2: number;
  p25PriceM2: number;
  p50PriceM2: number;
  p75PriceM2: number;
  maxPriceM2: number;
  minPrice: number;
  p25Price: number;
  p50Price: number;
  p75Price: number;
  maxPrice: number;
  baremoBajoPriceM2: number;
  baremoAltoPriceM2: number;
  baremoBajoPrice: number;
  baremoAltoPrice: number;
  recommendedMinPrice: number;
  recommendedMaxPrice: number;
  pricingPosition:
    | "por_debajo_baremo_bajo"
    | "en_baremo_bajo"
    | "en_media"
    | "en_baremo_alto"
    | "por_encima_baremo_alto";
}

// ---------------------------------------------------------------------------
// Resultado completo del análisis
// ---------------------------------------------------------------------------

export interface PricingAnalysisResult {
  propertyCode: string;
  input: PricingPropertyInput;
  comparabilityProfile?: PropertyComparabilityProfile;
  comparables: PricingComparable[];
  stats: PricingClusterStats;
  zoneStudy?: ZoneStudySummary;
  optimalPricing?: OptimalPricingSummary;
  analyzedAt: string;
  trend?: PricingTrendSummary;
  queryMeta: {
    endpoint: "snapshot" | "properties";
    housing: StatefoxHousing;
    type: StatefoxListingType;
    pagesScanned: number;
    totalResultsFromAPI: number;
    filteredResults: number;
    comparability: PricingComparabilityMeta;
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
  /** Contexto de ejecución para persistencia/observabilidad del informe materializado. */
  sourceTrigger?: string;
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

/**
 * Error de elegibilidad: la propiedad existe y tiene datos, pero no cumple
 * la política de negocio para ejecutar Smart Pricing.
 */
export class PricingNotEligibleError extends Error {
  public readonly reasons: string[];
  constructor(propertyCode: string, reasons: string[]) {
    super(
      `Análisis de pricing no permitido para inmueble ${propertyCode}: ${reasons.join(", ")}`,
    );
    this.name = "PricingNotEligibleError";
    this.reasons = reasons;
  }
}
