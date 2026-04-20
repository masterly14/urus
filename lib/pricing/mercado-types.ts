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
}

export interface MercadoResponse {
  zones: ZoneAggregation[];
  competitors: CompetitorProperty[];
  ciudad: string;
  generatedAt: string;
}
