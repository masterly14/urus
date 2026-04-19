/**
 * Tipos extendidos para la evaluación del agente conversacional.
 *
 * Extiende la infraestructura de eval existente (lib/eval/types.ts) con:
 * - Escenarios que incluyen expectations de tool calls y response traits
 * - Judge input/output para las dimensiones conversacionales
 * - Tipos de grading determinista
 * - Tipos de run summary con métricas de agente
 */

import type {
  PropertySummaryForNLU,
  NLUResult,
} from "@/lib/agents/types";
import type {
  ConversationalAgentOutput,
  ConversationPhase,
  ToolCallResult,
} from "@/lib/agents/conversational-agent-types";
import type { BuyerPersona, ExpectedOutcome } from "./types";

// ── Categorías de eval conversacional ───────────────────────────────────────

export type ConversationalEvalCategory =
  | "greeting_handling"
  | "rapport_response"
  | "property_inquiry"
  | "feedback_with_response"
  | "visit_intent"
  | "more_options_request"
  | "escalation_needed"
  | "out_of_scope"
  | "multi_turn_conversation";

// ── Trait expectations para la respuesta ────────────────────────────────────

export interface ResponseTraitExpectation {
  trait: string;
  weight: number;
}

// ── Trajectory match modes (inspirado en LangSmith agentevals) ──────────────

export type TrajectoryMatchMode = "strict" | "unordered" | "subset" | "superset";

// ── Simplified turn for eval scenarios (timestamp optional) ─────────────────

export interface EvalConversationTurn {
  role: "buyer" | "system";
  text?: string;
  content?: string;
  timestamp?: string;
}

// ── Escenario conversacional ────────────────────────────────────────────────

export interface ConversationalEvalScenario {
  id: string;
  name: string;
  category: ConversationalEvalCategory;
  properties: PropertySummaryForNLU[];
  conversationHistory: EvalConversationTurn[];
  persona: BuyerPersona;
  conversationPhase: ConversationPhase;
  buyerDigest: string | null;

  /** Mensaje fijo del comprador (si se omite, se genera con buyer-agent). */
  fixedMessage?: string;
  buyerInstructions: string;

  /** Tools que se espera invoque el agente. */
  expectedToolCalls?: string[];
  /** Modo de comparación de trajectory. Default: "subset". */
  trajectoryMatchMode?: TrajectoryMatchMode;
  /**
   * Conjuntos alternativos de tools que también se consideran válidos. Útil cuando el
   * objetivo del turno admite varios caminos (p. ej. "pedir más opciones" puede
   * resolverse con `request_more_options` o con `update_demand`). Cada alternativa se
   * evalúa con el mismo `trajectoryMatchMode` que `expectedToolCalls` y basta con que
   * una de ellas pase para considerar el grader superado.
   */
  alternativeExpectedToolCalls?: string[][];

  /** Rasgos esperados de la respuesta (evaluados por LLM judge). */
  expectedResponseTraits?: ResponseTraitExpectation[];

  /** Patrones regex/strings que NO deben aparecer en responseText. */
  forbiddenPatterns?: string[];

  /** NLU expected outcome (para escenarios que invocan classify_feedback). */
  expectedOutcome?: ExpectedOutcome;

  /** Si true, forma parte del golden regression dataset. */
  isRegression?: boolean;
}

// ── Input/Output del judge conversacional ───────────────────────────────────

export interface ConversationalJudgeInput {
  scenario: ConversationalEvalScenario;
  buyerMessage: string;
  agentOutput: ConversationalAgentOutput;
  properties: PropertySummaryForNLU[];
}

export interface ConversationalJudgeEvaluation {
  responseRelevanceScore: number;
  toneScore: number;
  actionabilityScore: number;
  coherenceScore: number;
  safetyScore: number;
  overallConversationalScore: number;
  reasoning: string;
  failures: string[];
}

// ── Resultados de graders deterministas ─────────────────────────────────────

export interface GraderResult {
  name: string;
  passed: boolean;
  score: number;
  details?: string;
}

// ── Trial (una ejecución de un escenario) ───────────────────────────────────

export interface ConversationalTrial {
  trialIndex: number;
  buyerMessage: string;
  agentOutput: ConversationalAgentOutput;
  graderResults: GraderResult[];
  judgeEvaluation: ConversationalJudgeEvaluation | null;
  nluJudgeScore: number | null;
  overallScore: number;
  latencyMs: number;
  passed: boolean;
}

// ── Resultado por escenario (agregado de trials) ────────────────────────────

export interface ConversationalScenarioResult {
  scenarioId: string;
  scenarioName: string;
  category: ConversationalEvalCategory;
  trials: ConversationalTrial[];
  passAtK: boolean;
  passAllK: boolean;
  avgOverallScore: number;
  avgLatencyMs: number;
}

// ── Summary del run completo ────────────────────────────────────────────────

export interface ConversationalCategorySummary {
  category: ConversationalEvalCategory;
  count: number;
  avgScore: number;
  passRate: number;
  avgLatencyMs: number;
}

export interface ConversationalRunSummary {
  runId: string;
  name: string;
  startedAt: string;
  completedAt: string;
  scenarioCount: number;
  trialCount: number;
  trialsPerScenario: number;
  avgOverallScore: number;
  passAtKRate: number;
  passAllKRate: number;
  avgLatencyMs: number;
  avgResponseRelevance: number;
  avgTone: number;
  avgActionability: number;
  avgCoherence: number;
  avgSafety: number;
  byCategory: ConversationalCategorySummary[];
  topFailures: { failure: string; count: number }[];
  results: ConversationalScenarioResult[];
}

// ── Config del eval harness ─────────────────────────────────────────────────

export interface ConversationalEvalConfig {
  trialsPerScenario: number;
  passThreshold: number;
  maxLatencyMs: number;
  regressionOnly: boolean;
  categories?: ConversationalEvalCategory[];
}

export const DEFAULT_EVAL_CONFIG: ConversationalEvalConfig = {
  trialsPerScenario: 3,
  passThreshold: 0.7,
  maxLatencyMs: 15_000,
  regressionOnly: false,
};
