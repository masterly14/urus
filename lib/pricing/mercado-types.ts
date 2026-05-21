/**
 * Tipos para la Vista de Mercado (M7).
 *
 * Endpoint: GET /api/pricing/mercado
 * Agrega properties_current + pricing_reports por zona para alimentar
 * el heatmap, tendencias y tabla de competencia.
 */

export type DemandLevel = "alta" | "media" | "baja";

export interface ZoneAggregation {
  zona: string;
  precioMedioM2: number;
  precioMedio: number;
  propiedades: number;
  propiedadesUrus: number;
  tendenciaPorcentaje: number;
  demanda: DemandLevel;
  densityPerKm2?: number | null;
  densityBucket?: "baja" | "media" | "alta" | "muy_alta" | "sin_datos";
  accessibilityMinutesDriving?: number | null;
}

export interface CompetitorProperty {
  propertyCode: string;
  titulo: string;
  precio: number;
  metros: number;
  precioM2: number;
  zona: string;
  semaforo: string;
  gapPorcentaje: number;
  diasPublicado: number | null;
  totalComparables: number;
  optimalPriceMin?: number | null;
  optimalPriceMax?: number | null;
  densityBucket?: "baja" | "media" | "alta" | "muy_alta" | "sin_datos";
}

export interface MercadoResponse {
  zones: ZoneAggregation[];
  competitors: CompetitorProperty[];
  ciudad: string;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Lazy-loaded detail per zone
// Endpoint: GET /api/pricing/mercado/zona/[zona]
// ---------------------------------------------------------------------------

export interface ZonePropertyDetail {
  codigo: string;
  titulo: string;
  precio: number;
  metrosConstruidos: number;
  precioM2: number;
  habitaciones: number;
  banyos: number;
  ciudad: string;
  zona: string;
  estado: string;
  mainPhotoUrl: string | null;
  numFotos: number;
  portalUrl: string | null;
  portalName: string | null;
  /** Semáforo del informe de pricing si existe; null si la propiedad aún no tiene informe. */
  semaforo: "verde" | "amarillo" | "rojo" | "sin_datos" | null;
  /** Gap porcentual del informe; null si aún no tiene informe. */
  gapPorcentaje: number | null;
  /** Fecha en la que se analizó por última vez el pricing; null si nunca. */
  analyzedAt: string | null;
}

export interface ZoneDetailResponse {
  zona: string;
  totalUrus: number;
  properties: ZonePropertyDetail[];
  generatedAt: string;
}
