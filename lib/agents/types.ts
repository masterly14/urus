/**
 * Tipos del módulo M5 — Smart Matching + LangGraph.
 * Define el estado del grafo NLU y los resultados de clasificación/extracción.
 */

// ── Intención clasificada por el agente NLU ──────────────────────────────────

export type IntentionWhatsApp =
  | "ME_ENCAJA"        // El comprador está satisfecho con la propiedad/propuesta
  | "NO_ME_ENCAJA"     // No cumple sus requisitos → extrae variables de ajuste
  | "BUSCO_DIFERENTE"; // Cambio de tipología/zona completamente distinto

// ── Variables de demanda extraídas del texto libre ───────────────────────────

export interface DemandVariables {
  precioMin?: number;
  precioMax?: number;
  metrosMin?: number;
  metrosMax?: number;
  habitacionesMin?: number;
  zonas?: string[];       // nombres de zona tal como los menciona el comprador
  tipos?: string[];       // "piso", "casa", "ático", "estudio", etc.
  extras?: string[];      // "garaje", "terraza", "ascensor", etc.
}

// ── Resultado del agente NLU ─────────────────────────────────────────────────

export interface NLUResult {
  intention: IntentionWhatsApp;
  confidence: number;           // 0–1, qué tan seguro está el modelo
  variables: DemandVariables;   // sólo presente cuando intention = NO_ME_ENCAJA
  rawText: string;              // texto original para auditoría
  reasoning?: string;           // cadena de pensamiento (para logs)
}

// ── Estado del grafo LangGraph ────────────────────────────────────────────────

export interface NLUGraphInput {
  messageText: string;
  buyerPhone: string;
  demandId: string;
}

export interface NLUGraphOutput {
  nluResult: NLUResult;
}
