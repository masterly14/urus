/**
 * Grafo LangGraph del agente conversacional.
 *
 * Patrón ReAct: un solo nodo "process" que invoca el LLM con tools,
 * ejecuta los tool calls devueltos, y re-invoca hasta que el LLM
 * produzca una respuesta final de texto (max N iteraciones).
 *
 * Modelo: gpt-5.4-mini con temperature 0.3 (variabilidad natural sin alucinaciones).
 */

import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { withRetry } from "./utils/retry";
import { buildConversationalSystemPrompt } from "./conversational-prompt";
import { createConversationalTools, type ToolExecutionContext } from "./conversational-tools";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type {
  ConversationalAgentInput,
  ConversationalAgentOutput,
  ConversationalGraphState,
  ConversationPhase,
  ToolCallResult,
} from "./conversational-agent-types";
import type { NLUResult } from "./types";

// ── Configuración ───────────────────────────────────────────────────────────

const MAX_TOOL_ROUNDS = parseInt(
  process.env.CONVERSATIONAL_AGENT_MAX_TOOL_ROUNDS ?? "3",
  10,
);

const TEMPERATURE = parseFloat(
  process.env.CONVERSATIONAL_AGENT_TEMPERATURE ?? "0.3",
);

function requireApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY no está definida");
  return key;
}

// Lazy LLM instance for the conversational agent
let _llmInstance: ChatOpenAI | null = null;
function getConversationalLLM(): ChatOpenAI {
  if (!_llmInstance) {
    _llmInstance = new ChatOpenAI({
      model: "gpt-5.4-mini",
      temperature: TEMPERATURE,
      apiKey: requireApiKey(),
      timeout: 45_000,
    });
  }
  return _llmInstance;
}

// ── Estado del grafo ────────────────────────────────────────────────────────

const ConversationalState = Annotation.Root({
  input: Annotation<ConversationalAgentInput>,
  output: Annotation<ConversationalAgentOutput | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  error: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
});

type StateType = typeof ConversationalState.State;

// ── Inferir siguiente fase conversacional ───────────────────────────────────

function inferNextPhase(
  currentPhase: ConversationPhase,
  toolResults: ToolCallResult[],
): ConversationPhase {
  const toolNames = new Set(toolResults.map((t) => t.toolName));

  // Escalado tiene prioridad: una vez transferido al humano, el agente queda a la espera.
  if (toolNames.has("escalate_to_human")) return "IDLE_FOLLOWUP";
  if (toolNames.has("initiate_visit")) return "SCHEDULING_VISIT";
  if (toolNames.has("request_more_options") || toolNames.has("update_demand")) {
    return "REVIEWING_OPTIONS";
  }
  if (toolNames.has("classify_feedback") || toolNames.has("emit_selection_feedback")) {
    return "GIVING_FEEDBACK";
  }

  if (currentPhase === "INITIAL_CONTACT" && toolResults.length === 0) {
    return "REVIEWING_OPTIONS";
  }

  return currentPhase;
}

// ── Nodo principal de procesamiento ─────────────────────────────────────────

async function processNode(state: StateType): Promise<Partial<StateType>> {
  const { input } = state;

  try {
    const systemPrompt = buildConversationalSystemPrompt(input);
    const toolCtx: ToolExecutionContext = {
      buyerWaId: input.buyerWaId,
      demandId: input.demandId,
      selectionId: input.selectionId,
      properties: input.properties,
      conversationHistory: input.conversationHistory,
    };

    const tools = createConversationalTools(toolCtx);
    const llm = getConversationalLLM();
    const llmWithTools = llm.bindTools(tools);

    const messages: BaseMessage[] = [
      new SystemMessage(systemPrompt),
      new HumanMessage(input.messageText),
    ];

    const allToolResults: ToolCallResult[] = [];
    let nluResult: NLUResult | undefined;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await withRetry(() => llmWithTools.invoke(messages));
      messages.push(response);

      const toolCalls = (response as AIMessage).tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        const responseText = typeof response.content === "string"
          ? response.content
          : (response.content as Array<{ type: string; text?: string }>)
              .filter((c) => c.type === "text")
              .map((c) => c.text ?? "")
              .join("");

        const nextPhase = inferNextPhase(input.conversationPhase, allToolResults);

        return {
          output: {
            responseText,
            toolResults: allToolResults,
            nextPhase,
            nluResult,
          },
        };
      }

      for (const tc of toolCalls) {
        const tool = tools.find((t) => t.name === tc.name);
        let resultStr: string;

        if (!tool) {
          resultStr = JSON.stringify({ error: `Tool "${tc.name}" not found` });
        } else {
          try {
            const toolResult = await (tool as StructuredToolInterface).invoke(
              { ...tc.args } as Record<string, unknown>,
            );
            resultStr = typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            resultStr = JSON.stringify({ error: msg });
          }
        }

        messages.push(new ToolMessage({ content: resultStr, tool_call_id: tc.id! }));

        allToolResults.push({
          toolName: tc.name,
          args: tc.args as Record<string, unknown>,
          result: JSON.parse(resultStr),
        });

        if (tc.name === "classify_feedback") {
          try {
            nluResult = JSON.parse(resultStr) as NLUResult;
          } catch { /* non-critical */ }
        }
      }
    }

    // Max rounds reached — get final text response without tools
    const finalResponse = await withRetry(() => llm.invoke(messages));
    const finalText = typeof finalResponse.content === "string"
      ? finalResponse.content
      : (finalResponse.content as Array<{ type: string; text?: string }>)
          .filter((c) => c.type === "text")
          .map((c) => c.text ?? "")
          .join("");

    const nextPhase = inferNextPhase(input.conversationPhase, allToolResults);

    return {
      output: {
        responseText: finalText,
        toolResults: allToolResults,
        nextPhase,
        nluResult,
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { error: `Error en agente conversacional: ${errorMsg}` };
  }
}

// ── Grafo compilado ─────────────────────────────────────────────────────────

export const conversationalGraph = new StateGraph(ConversationalState)
  .addNode("process", processNode)
  .addEdge(START, "process")
  .addEdge("process", END)
  .compile();

// ── Función de entrada pública ──────────────────────────────────────────────

export async function runConversationalAgent(
  input: ConversationalAgentInput,
): Promise<ConversationalAgentOutput> {
  const result = await conversationalGraph.invoke({ input });

  if (result.error) throw new Error(result.error);
  if (!result.output) throw new Error("El agente conversacional no produjo resultado");

  return result.output;
}
