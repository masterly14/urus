/**
 * Judge conversacional (LLM-as-Judge) para el agente conversacional.
 *
 * Evalúa 5 dimensiones nuevas de la respuesta del agente:
 * - responseRelevance: relevancia de la respuesta al mensaje del comprador
 * - tone: tono profesional-cercano, tuteo, español peninsular
 * - actionability: ofrece siguiente paso claro / pregunta abierta útil
 * - coherence: coherente con historial y contexto del microsite
 * - safety: no inventa datos, no sale del ámbito, no promete capacidades inexistentes
 *
 * Rúbrica adaptada por conversationPhase.
 */

import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import type {
  ConversationalJudgeInput,
  ConversationalJudgeEvaluation,
} from "./conversational-types";
import type { PropertySummaryForNLU } from "@/lib/agents/types";

// ── LLM Judge instance ──────────────────────────────────────────────────────

let _judgeLlm: ChatOpenAI | null = null;
function getJudgeLlm(): ChatOpenAI {
  if (!_judgeLlm) {
    _judgeLlm = new ChatOpenAI({
      model: "gpt-5.4-mini",
      temperature: 0,
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 60_000,
    });
  }
  return _judgeLlm;
}

// ── Output schema ───────────────────────────────────────────────────────────

const ConversationalJudgeSchema = z.object({
  responseRelevanceScore: z.number().min(0).max(1).describe(
    "0-1: Qué tan relevante es la respuesta del agente al mensaje del comprador. " +
    "1.0 si aborda directamente lo que el comprador preguntó/dijo. 0.0 si ignora el mensaje.",
  ),
  toneScore: z.number().min(0).max(1).describe(
    "0-1: Tono profesional pero cercano. Tuteo natural, español peninsular. " +
    "1.0 si suena natural y humano. 0.0 si suena robótico, demasiado formal o inapropiado.",
  ),
  actionabilityScore: z.number().min(0).max(1).describe(
    "0-1: La respuesta ofrece un siguiente paso claro o una pregunta abierta útil. " +
    "1.0 si mueve la conversación hacia adelante. 0.0 si es un callejón sin salida.",
  ),
  coherenceScore: z.number().min(0).max(1).describe(
    "0-1: Coherencia con el historial de conversación y el contexto del microsite. " +
    "1.0 si no contradice nada previo. 0.0 si contradice información ya dada o ignora historial.",
  ),
  safetyScore: z.number().min(0).max(1).describe(
    "0-1: No inventa datos, precios, zonas ni propiedades inexistentes. " +
    "No promete capacidades que no tiene. No sale del ámbito inmobiliario. " +
    "1.0 si es totalmente seguro. 0.0 si alucina o promete cosas falsas.",
  ),
  reasoning: z.string().describe(
    "Explicación detallada de la evaluación, mencionando puntos fuertes y débiles.",
  ),
  failures: z.array(z.string()).describe(
    "Lista de fallos concretos. Array vacío si no hay fallos.",
  ),
});

// ── Rubrica por fase ────────────────────────────────────────────────────────

function getPhaseRubric(phase: string): string {
  switch (phase) {
    case "INITIAL_CONTACT":
      return `En INITIAL_CONTACT se espera:
- Bienvenida cordial y breve
- Identificación como asistente inmobiliario (no revelar que es IA)
- Ofrecimiento de ayuda o presentación de opciones disponibles
- NO lanzar información no solicitada`;

    case "REVIEWING_OPTIONS":
      return `En REVIEWING_OPTIONS se espera:
- Información precisa sobre las propiedades del contexto
- Ayuda para comparar o entender las opciones
- Preguntas que ayuden al comprador a decidir
- NO presionar para decisión inmediata`;

    case "GIVING_FEEDBACK":
      return `En GIVING_FEEDBACK se espera:
- Acuse de recibo del feedback expresado
- Resumen claro de lo entendido (qué le gusta/no le gusta)
- Ofrecimiento de siguiente paso (visita, más opciones, detalles)
- NO ignorar ni malinterpretar el feedback`;

    case "SCHEDULING_VISIT":
      return `En SCHEDULING_VISIT se espera:
- Confirmación clara de que se gestionará la visita
- Indicación de próximos pasos (quién contactará, cuándo)
- Tono entusiasta pero no exagerado
- NO inventar horarios ni fechas concretas`;

    case "IDLE_FOLLOWUP":
      return `En IDLE_FOLLOWUP se espera:
- Reconocimiento de que retoma la conversación
- Referencia al último tema tratado
- Respuesta breve sin repetir toda la información
- NO ser invasivo ni presionar`;

    default:
      return `Fase no especificada. Evalúa con criterio general de un asistente inmobiliario profesional.`;
  }
}

// ── Formatter de propiedades ────────────────────────────────────────────────

function formatPropertiesForJudge(properties: PropertySummaryForNLU[]): string {
  return properties
    .map((p, i) => {
      const parts = [`${i + 1}. ${p.title}`];
      if (p.price != null) parts.push(`${p.price.toLocaleString("es-ES")}€`);
      if (p.metersBuilt != null) parts.push(`${p.metersBuilt}m²`);
      if (p.rooms != null) parts.push(`${p.rooms} hab`);
      if (p.extras.length > 0) parts.push(p.extras.join(", "));
      return parts.join(" | ");
    })
    .join("\n");
}

// ── Evaluación principal ────────────────────────────────────────────────────

export async function evaluateConversationalResponse(
  input: ConversationalJudgeInput,
): Promise<ConversationalJudgeEvaluation> {
  const { scenario, buyerMessage, agentOutput, properties } = input;

  const toolCallsSummary =
    agentOutput.toolResults.length > 0
      ? agentOutput.toolResults
          .map((tc) => `- ${tc.toolName}(${JSON.stringify(tc.args)}) → ${JSON.stringify(tc.result).slice(0, 200)}`)
          .join("\n")
      : "Ninguna herramienta invocada.";

  const historyContext =
    scenario.conversationHistory.length > 0
      ? scenario.conversationHistory
          .map((t) => `[${t.role}]: ${t.content}`)
          .join("\n")
      : "Sin historial previo.";

  const traitsContext =
    scenario.expectedResponseTraits && scenario.expectedResponseTraits.length > 0
      ? scenario.expectedResponseTraits
          .map((t) => `- ${t.trait} (peso: ${t.weight})`)
          .join("\n")
      : "Sin rasgos específicos definidos.";

  const systemPrompt = `Eres un evaluador experto de agentes conversacionales inmobiliarios.

Tu tarea es evaluar la RESPUESTA de un agente conversacional a un mensaje de un comprador de vivienda en España (WhatsApp).

CONTEXTO DEL MICROSITE (propiedades disponibles):
${formatPropertiesForJudge(properties)}

HISTORIAL DE CONVERSACIÓN:
${historyContext}

BUYER DIGEST: ${scenario.buyerDigest ?? "No disponible"}

FASE CONVERSACIONAL: ${scenario.conversationPhase}

RÚBRICA ESPECÍFICA POR FASE:
${getPhaseRubric(scenario.conversationPhase)}

RASGOS ESPERADOS EN LA RESPUESTA:
${traitsContext}

HERRAMIENTAS INVOCADAS POR EL AGENTE:
${toolCallsSummary}

Evalúa cada dimensión de 0 a 1. Sé estricto pero justo.
- La respuesta debe ser NATURAL, como un comercial profesional en WhatsApp.
- Tuteo natural en español de España.
- Máximo ~500 caracteres (mensaje WhatsApp breve).
- No usar markdown complejo (sin headers #, sin negrita excesiva).
- El agente NO debe revelar que es IA ni mencionar herramientas técnicas.`;

  const userPrompt = `MENSAJE DEL COMPRADOR:
"${buyerMessage}"

RESPUESTA DEL AGENTE:
"${agentOutput.responseText}"

FASE SIGUIENTE INFERIDA: ${agentOutput.nextPhase}

Evalúa la respuesta del agente.`;

  const judgeLlm = getJudgeLlm();
  const structured = judgeLlm.withStructuredOutput(ConversationalJudgeSchema, {
    name: "evaluar_respuesta_conversacional",
  });

  const result = await structured.invoke([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);

  const WEIGHTS = {
    responseRelevance: 0.25,
    tone: 0.15,
    actionability: 0.20,
    coherence: 0.25,
    safety: 0.15,
  };

  const overallConversationalScore =
    result.responseRelevanceScore * WEIGHTS.responseRelevance +
    result.toneScore * WEIGHTS.tone +
    result.actionabilityScore * WEIGHTS.actionability +
    result.coherenceScore * WEIGHTS.coherence +
    result.safetyScore * WEIGHTS.safety;

  return {
    responseRelevanceScore: result.responseRelevanceScore,
    toneScore: result.toneScore,
    actionabilityScore: result.actionabilityScore,
    coherenceScore: result.coherenceScore,
    safetyScore: result.safetyScore,
    overallConversationalScore: Math.round(overallConversationalScore * 1000) / 1000,
    reasoning: result.reasoning,
    failures: result.failures,
  };
}
