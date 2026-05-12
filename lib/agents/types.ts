/**
 * Tipos del módulo M5 — Smart Matching + LangGraph.
 * Define el estado del grafo NLU y los resultados de clasificación/extracción.
 */

// ── Intención clasificada por el agente NLU ──────────────────────────────────
//
// Importante: tras el refactor del flujo "Me encaja" (M6), el interés positivo
// del comprador **NO** se infiere por NLU — se captura exclusivamente con el
// botón "Me encaja" del micrositio (canal canónico `microsite_card`). Por eso
// el intent `ME_ENCAJA` está eliminado del contrato. Si el comprador escribe
// algo que suene a interés positivo en texto libre, el handler debe
// redirigirle al botón en lugar de emitir `SELECCION_COMPRADOR` con
// `ME_INTERESA`.
export type IntentionWhatsApp =
  | "NO_ME_ENCAJA"
  | "BUSCO_DIFERENTE"
  | "OTRO";

// ── Variables de demanda extraídas del texto libre ───────────────────────────

export interface DemandVariables {
  precioMin?: number;
  precioMax?: number;
  metrosMin?: number;
  metrosMax?: number;
  habitacionesMin?: number;
  ciudad?: string;
  zonas?: string[];
  tipos?: string[];
  extras?: string[];
  extrasNoDeseados?: string[];
}

// ── Feedback por propiedad del microsite ─────────────────────────────────────
//
// Solo se modela el sentimiento negativo (`NO_ME_ENCAJA`) que el NLU sí puede
// inferir a partir de texto libre. El positivo se captura por botón
// (ver `IntentionWhatsApp`).
export interface PropertyFeedbackItem {
  propertyId: string;
  sentiment: "NO_ME_ENCAJA";
}

export interface PropertySummaryForNLU {
  propertyId: string;
  title: string;
  price: number | null;
  zone: string | null;
  city: string | null;
  metersBuilt: number | null;
  rooms: number | null;
  extras: string[];
}

export interface ConversationTurn {
  role: "buyer" | "system";
  text: string;
  timestamp: string;
}

// ── Resultado del agente NLU ─────────────────────────────────────────────────

export interface NLUResult {
  intention: IntentionWhatsApp;
  confidence: number;
  propertyFeedback: PropertyFeedbackItem[];
  variables: DemandVariables;
  rawText: string;
  reasoning?: string;
  wantsMoreOptions?: boolean;
}

// ── Estado del grafo LangGraph ────────────────────────────────────────────────

export interface NLUGraphInput {
  messageText: string;
  buyerPhone: string;
  demandId: string;
  selectionProperties?: PropertySummaryForNLU[];
  conversationHistory?: ConversationTurn[];
}

export interface NLUGraphOutput {
  nluResult: NLUResult;
}
