/**
 * M5 — Módulo de agentes LangGraph.
 * Punto de entrada público para todos los grafos de IA del sistema.
 *
 * Agente de clasificación de respuestas WhatsApp (implementación oficial):
 * - Grafo: nluGraph
 * - Función de invocación: classifyWhatsAppResponse(input) → NLUResult
 * - Ubicación: lib/agents/nlu-graph.ts
 * - Documentación: lib/agents/README.md
 */

export { llm, llmWithStructuredOutput } from "./llm";
export { nluGraph, classifyWhatsAppResponse } from "./nlu-graph";
export {
  contractInstructionGraph,
  interpretContractVoiceInstructions,
} from "./contract-instruction-graph";
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
