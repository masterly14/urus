/**
 * Tipos del módulo M5 — Smart Matching + LangGraph.
 * Define el estado del grafo NLU y los resultados de clasificación/extracción.
 */

// ── Intención clasificada por el agente NLU ──────────────────────────────────

export type IntentionWhatsApp =
  | "ME_ENCAJA"
  | "NO_ME_ENCAJA"
  | "BUSCO_DIFERENTE";

// ── Variables de demanda extraídas del texto libre ───────────────────────────

export interface DemandVariables {
  precioMin?: number;
  precioMax?: number;
  metrosMin?: number;
  metrosMax?: number;
  habitacionesMin?: number;
  zonas?: string[];
  tipos?: string[];
  extras?: string[];
}

// ── Feedback por propiedad del microsite ─────────────────────────────────────

export interface PropertyFeedbackItem {
  propertyId: string;
  sentiment: "ME_INTERESA" | "NO_ME_ENCAJA";
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
