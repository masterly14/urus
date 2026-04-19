export type LeadTipo = "comprador" | "propietario";

export interface HistorySignals {
  whatsappTurnCount: number;
  visitaInteres: "alto" | "medio" | "bajo" | null;
  micrositeInteresCount: number;
}

export interface ScoringInput {
  tipo: LeadTipo;
  // Comprador
  preaprobacionHipotecaria?: boolean;
  presupuestoDefinido?: boolean;
  plazoDias?: number;
  mensajeConDetalles?: boolean;
  referido?: boolean;
  soloMirando?: boolean;
  // Propietario
  urgenciaVenta?: boolean;
  precioCercanoMercado?: boolean;
  exclusivaAceptable?: boolean;
  documentacionDisponible?: boolean;
  probarSinAgencia?: boolean;
  // v2: origen del lead
  source?: string;
  // v2: calidad del mensaje
  mensajeLongitud?: number;
  mensajeKeywords?: string[];
  // v2: historial de interacciones per-lead
  historySignals?: HistorySignals;
  // Raw fallback
  raw?: Record<string, unknown>;
}

export interface ScoringResult {
  score: number; // 0-100
  pclose: number; // normalized 0-100
  value: number; // normalized 0-100
  urgency: number; // normalized 0-100
  reasons: string[];
  weightsVersion: number | null;
}

export const WEIGHT_PCLOSE = 0.55;
export const WEIGHT_VALUE = 0.3;
export const WEIGHT_URGENCY = 0.15;

