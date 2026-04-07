/**
 * M12 — Bot de Soporte Mental: grafo LangGraph.
 *
 * Primer grafo del repo con routing condicional (addConditionalEdges).
 * Dos invocaciones LLM por turno:
 *   1. Clasificador (structured output, temp=0) → determina flujo + estado emocional
 *   2. Generador de respuesta (temp=0.7) → respuesta natural con prompt especializado
 *
 * Flujos: bloqueo | preparacion | descarga | enfoque | crecimiento | saludo
 */

import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { llmMentalHealthClassifier, llmMentalHealth } from "./llm";
import {
  MentalHealthClassificationSchema,
  type MentalHealthClassification,
  type MentalHealthGraphInput,
  type MentalHealthGraphOutput,
  type MentalHealthFlujo,
} from "./mental-health-types";
import { buildClassifierPrompt, buildResponsePrompt } from "./mental-health-prompts";

// ── Estado del grafo ────────────────────────────────────────────────────────

const MentalHealthState = Annotation.Root({
  input: Annotation<MentalHealthGraphInput>,
  classification: Annotation<MentalHealthClassification | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  responseText: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  error: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
});

type MHStateType = typeof MentalHealthState.State;

// ── LLM con structured output para clasificación ───────────────────────────

const classifierLLM = llmMentalHealthClassifier.withStructuredOutput(
  MentalHealthClassificationSchema,
  { name: "clasificar_estado_mental" },
);

// ── Nodo 1: Clasificador ────────────────────────────────────────────────────

async function classifyNode(state: MHStateType): Promise<Partial<MHStateType>> {
  const { messageText, sessionContext, crmContext, conversationHistory } = state.input;

  try {
    const systemPrompt = buildClassifierPrompt(sessionContext, crmContext, conversationHistory);
    const classification = await classifierLLM.invoke([
      { role: "system", content: systemPrompt },
      { role: "user", content: messageText },
    ]);

    return { classification };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `Error en clasificación mental health: ${msg}` };
  }
}

// ── Router condicional ──────────────────────────────────────────────────────

function routeByFlujo(state: MHStateType): MentalHealthFlujo | typeof END {
  if (state.error || !state.classification) return END;
  return state.classification.flujo;
}

// ── Nodos de respuesta (uno por flujo) ──────────────────────────────────────

function createResponseNode(flujoName: MentalHealthFlujo) {
  return async function responseNode(state: MHStateType): Promise<Partial<MHStateType>> {
    const { conversationHistory, crmContext, sessionContext } = state.input;
    const classification = state.classification!;

    try {
      const systemPrompt = buildResponsePrompt(
        classification,
        crmContext,
        conversationHistory,
        sessionContext.turnCount,
        sessionContext.flujoStep,
      );

      const result = await llmMentalHealth.invoke([
        { role: "system", content: systemPrompt },
        { role: "user", content: state.input.messageText },
      ]);

      const responseText = typeof result.content === "string"
        ? result.content
        : String(result.content);

      return { responseText };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { error: `Error en respuesta ${flujoName}: ${msg}` };
    }
  };
}

// ── Grafo compilado ─────────────────────────────────────────────────────────

const FLUJO_NODES = [
  "bloqueo",
  "preparacion",
  "descarga",
  "enfoque",
  "crecimiento",
  "saludo",
] as const;

const graphBuilder = new StateGraph(MentalHealthState)
  .addNode("classify", classifyNode);

for (const flujo of FLUJO_NODES) {
  graphBuilder.addNode(flujo, createResponseNode(flujo));
}

graphBuilder
  .addEdge(START, "classify")
  .addConditionalEdges("classify", routeByFlujo, [...FLUJO_NODES, END]);

for (const flujo of FLUJO_NODES) {
  graphBuilder.addEdge(flujo, END);
}

export const mentalHealthGraph = graphBuilder.compile();

// ── Función de entrada pública ──────────────────────────────────────────────

export async function processMentalHealthMessage(
  input: MentalHealthGraphInput,
): Promise<MentalHealthGraphOutput> {
  const result = await mentalHealthGraph.invoke({ input });

  if (result.error) {
    throw new Error(result.error);
  }

  if (!result.classification) {
    throw new Error("El clasificador mental health no produjo resultado");
  }

  const responseText = result.responseText
    ?? "No he podido generar una respuesta. Inténtalo de nuevo.";

  return {
    responseText,
    classification: result.classification,
  };
}
