/**
 * Módulo de agentes LangGraph.
 * Punto de entrada público para todos los grafos de IA del sistema.
 *
 * Grafos disponibles:
 * - nluGraph (M5): clasificación de respuestas WhatsApp
 * - contractInstructionGraph (M8): transcripción → parche de contrato
 * - pricingRecommendationGraph (M7): análisis estadístico → diagnóstico + recomendaciones
 * - colaboradoresRecommendationGraph (M11): flota de colaboradores → recomendaciones estratégicas
 * - ceoDiagnosticGraph (M13): datos consolidados → diagnóstico y recomendaciones CEO
 * - ceoExpansionGraph (M13): datos financieros/operativos → evaluación de expansión geográfica
 * - ceoFinancialGraph (M13): datos financieros → análisis de costes, ROI y reinversión
 * - leadScoringGraph: scoring cualitativo IA para complementar reglas estáticas
 */

export { llm, llmWithStructuredOutput } from "./llm";
export { nluGraph, classifyWhatsAppResponse, classifyBuyerFeedback } from "./nlu-graph";
export {
  contractInstructionGraph,
  interpretContractVoiceInstructions,
} from "./contract-instruction-graph";
export {
  pricingRecommendationGraph,
  generatePricingRecommendation,
} from "./pricing-recommendation-graph";
export {
  colaboradoresRecommendationGraph,
  generateColaboradoresRecommendation,
} from "./colaboradores-recommendation-graph";
export {
  ceoDiagnosticGraph,
  generateCeoDiagnostic,
} from "./ceo-diagnostic-graph";
export {
  ceoExpansionGraph,
  generateCeoExpansion,
} from "./ceo-expansion-graph";
export {
  ceoFinancialGraph,
  generateCeoFinancial,
} from "./ceo-financial-graph";
export {
  leadScoringGraph,
  scoreLeadWithAI,
} from "./lead-scoring-graph";
export type {
  ContractInstructionGraphInput,
  ContractVoiceStructuredPatch,
} from "./contract-instruction-types";
export type {
  IntentionWhatsApp,
  DemandVariables,
  NLUResult,
  NLUGraphInput,
  NLUGraphOutput,
  PropertyFeedbackItem,
  PropertySummaryForNLU,
  ConversationTurn,
} from "./types";
