/**
 * Módulo de agentes LangGraph.
 * Punto de entrada público para todos los grafos de IA del sistema.
 *
 * Grafos disponibles:
 * - nluGraph (M5): clasificación de respuestas WhatsApp
 * - contractInstructionGraph (M8): transcripción → parche de contrato
 * - pricingRecommendationGraph (M7): análisis estadístico → diagnóstico + recomendaciones
 */

export { llm, llmWithStructuredOutput } from "./llm";
export { nluGraph, classifyWhatsAppResponse } from "./nlu-graph";
export {
  contractInstructionGraph,
  interpretContractVoiceInstructions,
} from "./contract-instruction-graph";
export {
  pricingRecommendationGraph,
  generatePricingRecommendation,
} from "./pricing-recommendation-graph";
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
} from "./types";
