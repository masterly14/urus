/**
 * Tipos del agente conversacional (Conversational Shell).
 *
 * El agente conversacional envuelve al NLU clasificador y a otras capacidades
 * del sistema (visitas, demanda, microsites) en un flujo de chat natural
 * que siempre genera una respuesta al comprador.
 */

import type { NLUResult, PropertySummaryForNLU, ConversationTurn } from "./types";
import type {
  PostVisitPolicyState,
  PostVisitStructuredContext,
} from "@/lib/visitas/post-visit-context-types";
import type {
  ConversationSignals,
  DemandCriteriaSnapshot,
} from "./conversation-signals";

// ── Fases de la conversación ────────────────────────────────────────────────

export type ConversationPhase =
  | "INITIAL_CONTACT"
  | "REVIEWING_OPTIONS"
  | "GIVING_FEEDBACK"
  | "POST_VISIT_REPROFILING"
  | "SCHEDULING_VISIT"
  | "IDLE_FOLLOWUP"
  | "UNKNOWN";

// ── Input del agente ────────────────────────────────────────────────────────

export interface ConversationalAgentInput {
  messageText: string;
  buyerWaId: string;
  demandId: string;
  selectionId: string | null;
  properties: PropertySummaryForNLU[];
  conversationHistory: ConversationTurn[];
  buyerDigest: string | null;
  conversationPhase: ConversationPhase;
  postVisitStructuredContext?: PostVisitStructuredContext | null;
  policyHints?: PostVisitPolicyState | null;
  /** Criterios actuales registrados en la demanda (para que el agente no los vuelva a preguntar). */
  demandCriteria?: DemandCriteriaSnapshot | null;
  /** Señales precomputadas (anti-bucle, gatillo de búsqueda) calculadas en el handler. */
  signals?: ConversationSignals | null;
}

// ── Output del agente ───────────────────────────────────────────────────────

export interface ToolCallResult {
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
}

export interface ConversationalAgentOutput {
  responseText: string;
  toolResults: ToolCallResult[];
  nextPhase: ConversationPhase;
  nluResult?: NLUResult;
}

// ── Estado interno del grafo LangGraph ──────────────────────────────────────

export interface ConversationalGraphState {
  input: ConversationalAgentInput;
  output: ConversationalAgentOutput | null;
  error: string | null;
}
