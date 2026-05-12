import type {
  PropertySummaryForNLU,
  ConversationTurn,
  NLUResult,
  IntentionWhatsApp,
} from "@/lib/agents/types";

export type EvalScenarioCategory =
  | "property_resolution"
  | "sentiment_accuracy"
  | "variable_extraction"
  | "wants_more_detection"
  | "multi_turn"
  | "ambiguity_handling"
  | "edge_case";

export interface BuyerPersona {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
}

export interface ExpectedOutcome {
  intention?: IntentionWhatsApp;
  // Sólo se modela el rechazo. El interés positivo se captura por botón en el
  // micrositio (canal canónico `microsite_card`), no por NLU.
  propertyFeedback?: { propertyId: string; sentiment: "NO_ME_ENCAJA" }[];
  variableKeys?: string[];
  wantsMoreOptions?: boolean;
}

export interface EvalScenario {
  id: string;
  name: string;
  category: EvalScenarioCategory;
  properties: PropertySummaryForNLU[];
  conversationHistory: ConversationTurn[];
  persona: BuyerPersona;
  expectedOutcome: ExpectedOutcome;
  buyerInstructions: string;
  turns?: number;
}

export interface BuyerAgentInput {
  persona: BuyerPersona;
  properties: PropertySummaryForNLU[];
  scenario: EvalScenario;
  turnNumber: number;
  previousTurns: ConversationTurn[];
}

export interface BuyerAgentOutput {
  messageText: string;
  internalReasoning: string;
}

export interface JudgeInput {
  scenario: EvalScenario;
  buyerMessage: string;
  nluResult: NLUResult;
  properties: PropertySummaryForNLU[];
  expectedOutcome: ExpectedOutcome;
}

export interface JudgeEvaluation {
  propertyResolutionScore: number;
  sentimentAccuracyScore: number;
  variableExtractionScore: number;
  intentionScore: number;
  wantsMoreScore: number;
  hallucinationPenalty: number;
  overallScore: number;
  reasoning: string;
  failures: string[];
}

export interface CategorySummary {
  category: EvalScenarioCategory;
  count: number;
  avgScore: number;
  avgPropertyResolution: number;
  avgSentimentAccuracy: number;
  avgVariableExtraction: number;
}

export interface PersonaSummary {
  personaId: string;
  personaName: string;
  count: number;
  avgScore: number;
}

export interface RunSummary {
  runId: string;
  name: string;
  scenarioCount: number;
  avgOverallScore: number;
  avgPropertyResolution: number;
  avgSentimentAccuracy: number;
  avgVariableExtraction: number;
  avgIntention: number;
  avgWantsMore: number;
  avgHallucination: number;
  avgLatencyMs: number;
  byCategory: CategorySummary[];
  byPersona: PersonaSummary[];
  topFailures: { failure: string; count: number }[];
}

export type { PropertySummaryForNLU, ConversationTurn, NLUResult, IntentionWhatsApp };

// Re-export conversational eval types
export type {
  ConversationalEvalCategory,
  ConversationalEvalScenario,
  EvalConversationTurn,
  ResponseTraitExpectation,
  TrajectoryMatchMode,
  ConversationalJudgeInput,
  ConversationalJudgeEvaluation,
  GraderResult,
  ConversationalTrial,
  ConversationalScenarioResult,
  ConversationalCategorySummary,
  ConversationalRunSummary,
  ConversationalEvalConfig,
} from "./conversational-types";
