/**
 * Sandbox del agente conversacional.
 *
 * Ejecuta un turno del agente con mock tools — no escribe eventos en BD,
 * no encola jobs, no llama a WhatsApp. Ideal para:
 *
 *  - API del chat interactivo de pruebas (/api/chat-agente).
 *  - Orquestador de evaluación (lib/eval/conversational-orchestrator.ts).
 *  - Cualquier herramienta de debugging donde se quiera ver la respuesta
 *    del agente sin efectos colaterales.
 *
 * Reutiliza EXACTAMENTE el mismo system prompt y el mismo loop ReAct
 * que `conversational-graph.ts` para que los resultados sean fieles a
 * producción, excepto que los tools destructivos son reemplazados.
 */

import { ChatOpenAI } from "@langchain/openai";
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { buildConversationalSystemPrompt } from "./conversational-prompt";
import { createMockConversationalTools, resetMockCounters } from "@/lib/eval/conversational-mock-tools";
import type {
  ConversationalAgentInput,
  ConversationalAgentOutput,
  ConversationPhase,
  ToolCallResult,
} from "./conversational-agent-types";
import type { NLUResult } from "./types";

const MAX_TOOL_ROUNDS = 3;

let _sandboxLlm: ChatOpenAI | null = null;
function getSandboxLlm(): ChatOpenAI {
  if (!_sandboxLlm) {
    _sandboxLlm = new ChatOpenAI({
      model: "gpt-5.4-mini",
      temperature: parseFloat(process.env.CONVERSATIONAL_AGENT_TEMPERATURE ?? "0.3"),
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 45_000,
    });
  }
  return _sandboxLlm;
}

/** Infiere la siguiente fase conversacional a partir de las tools invocadas.
 *  Mantener idéntico a `conversational-graph.ts` para fidelidad a producción. */
export function inferNextPhase(
  currentPhase: ConversationPhase,
  toolResults: ToolCallResult[],
): ConversationPhase {
  const toolNames = new Set(toolResults.map((t) => t.toolName));
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

/** Ejecuta un turno del agente conversacional con mock tools. */
export async function runConversationalAgentSandboxed(
  input: ConversationalAgentInput,
): Promise<ConversationalAgentOutput> {
  resetMockCounters();

  const systemPrompt = buildConversationalSystemPrompt(input);
  const tools = createMockConversationalTools({
    buyerWaId: input.buyerWaId,
    demandId: input.demandId,
    selectionId: input.selectionId,
    properties: input.properties,
    conversationHistory: input.conversationHistory,
  });

  const llm = getSandboxLlm();
  const llmWithTools = llm.bindTools(tools);

  const messages: BaseMessage[] = [
    new SystemMessage(systemPrompt),
    new HumanMessage(input.messageText),
  ];

  const allToolResults: ToolCallResult[] = [];
  let nluResult: NLUResult | undefined;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await llmWithTools.invoke(messages);
    messages.push(response);

    const toolCalls = (response as AIMessage).tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      const responseText = extractText(response.content);
      return {
        responseText,
        toolResults: allToolResults,
        nextPhase: inferNextPhase(input.conversationPhase, allToolResults),
        nluResult,
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
        result: safeJsonParse(resultStr),
      });

      if (tc.name === "classify_feedback") {
        try {
          nluResult = JSON.parse(resultStr) as NLUResult;
        } catch {
          // No crítico: el NLU no devolvió JSON válido.
        }
      }
    }
  }

  // Max rounds alcanzado — forzar respuesta final sin tools.
  const finalResponse = await llm.invoke(messages);
  return {
    responseText: extractText(finalResponse.content),
    toolResults: allToolResults,
    nextPhase: inferNextPhase(input.conversationPhase, allToolResults),
    nluResult,
  };
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return (content as Array<{ type: string; text?: string }>)
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("");
  }
  return "";
}

function safeJsonParse(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}
