/**
 * M5/M6 — Agente NLU de clasificación de respuestas WhatsApp.
 *
 * Dos modos de operación:
 * 1. classifyWhatsAppResponse (legacy): texto libre sin contexto de microsite.
 * 2. classifyBuyerFeedback: texto + propiedades del microsite + historial conversacional.
 *    Resuelve referencias ambiguas ("la del centro", "la barata") a propiedades concretas.
 */

import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { z } from "zod";
import { llm } from "./llm";
import type {
  NLUResult,
  NLUGraphInput,
  PropertySummaryForNLU,
  ConversationTurn,
} from "./types";

// ── Schemas Zod ─────────────────────────────────────────────────────────────

const VariablesSchema = z.object({
  precioMin: z.number().nullable().describe("Precio mínimo en euros. null si no lo menciona."),
  precioMax: z.number().nullable().describe("Precio máximo en euros. null si no lo menciona."),
  metrosMin: z.number().nullable().describe("m² mínimos. null si no los menciona."),
  metrosMax: z.number().nullable().describe("m² máximos. null si no los menciona."),
  habitacionesMin: z.number().nullable().describe("Habitaciones mínimas. null si no lo menciona."),
  zonas: z.array(z.string()).nullable().describe("Zonas/barrios mencionados. null si ninguno."),
  tipos: z.array(z.string()).nullable().describe("Tipos de inmueble (piso, casa, ático). null si ninguno."),
  extras: z.array(z.string()).nullable().describe("Extras (garaje, terraza). null si ninguno."),
});

const PropertyFeedbackSchema = z.object({
  propertyId: z.string().describe("ID exacto de la propiedad del listado."),
  sentiment: z.enum(["ME_INTERESA", "NO_ME_ENCAJA"]).describe("Sentimiento del comprador hacia esta propiedad."),
});

const ContextualNLUOutputSchema = z.object({
  intention: z.enum(["ME_ENCAJA", "NO_ME_ENCAJA", "BUSCO_DIFERENTE"]).describe(
    "Intención global: ME_ENCAJA si le gustan propiedades, " +
    "NO_ME_ENCAJA si no cumplen sus requisitos, " +
    "BUSCO_DIFERENTE si quiere un cambio completo."
  ),
  confidence: z.number().min(0).max(1).describe("Confianza 0–1."),
  propertyFeedback: z.array(PropertyFeedbackSchema).describe(
    "Feedback por propiedad mencionada por el comprador. " +
    "Solo incluir propiedades que el comprador mencione explícitamente. " +
    "Array vacío si no menciona ninguna en concreto."
  ),
  variables: VariablesSchema.describe("Variables de demanda extraídas."),
  wantsMoreOptions: z.boolean().describe(
    "true si el comprador pide ver más propiedades, otras opciones, o algo nuevo."
  ),
  reasoning: z.string().describe("Razonamiento breve para auditoría."),
});

const SimpleNLUOutputSchema = z.object({
  intention: z.enum(["ME_ENCAJA", "NO_ME_ENCAJA", "BUSCO_DIFERENTE"]).describe(
    "Intención del comprador."
  ),
  confidence: z.number().min(0).max(1),
  variables: VariablesSchema,
  reasoning: z.string(),
});

// ── Estado del grafo ─────────────────────────────────────────────────────────

const NLUState = Annotation.Root({
  input: Annotation<NLUGraphInput>,
  nluResult: Annotation<NLUResult | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  error: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
});

type NLUStateType = typeof NLUState.State;

// ── LLMs estructurados ──────────────────────────────────────────────────────

const llmContextual = llm.withStructuredOutput(ContextualNLUOutputSchema, {
  name: "clasificar_feedback_comprador",
});

const llmSimple = llm.withStructuredOutput(SimpleNLUOutputSchema, {
  name: "clasificar_respuesta_whatsapp",
});

// ── Prompts ─────────────────────────────────────────────────────────────────

function buildContextualSystemPrompt(
  properties: PropertySummaryForNLU[],
  history: ConversationTurn[],
): string {
  const propsList = properties.map((p, i) => {
    const parts = [`  ${i + 1}. ID: ${p.propertyId}`];
    parts.push(`Título: ${p.title}`);
    if (p.price != null) parts.push(`Precio: ${p.price}€`);
    if (p.zone) parts.push(`Zona: ${p.zone}`);
    if (p.city) parts.push(`Ciudad: ${p.city}`);
    if (p.metersBuilt != null) parts.push(`${p.metersBuilt}m²`);
    if (p.rooms != null) parts.push(`${p.rooms} hab`);
    if (p.extras.length > 0) parts.push(`Extras: ${p.extras.join(", ")}`);
    return parts.join(" | ");
  }).join("\n");

  const historyBlock = history.length > 0
    ? "\n\nHistorial de conversación:\n" + history.map((t) =>
      `[${t.role === "buyer" ? "Comprador" : "Sistema"}]: ${t.text}`
    ).join("\n")
    : "";

  return `Eres un asistente inmobiliario de Urus Capital que analiza mensajes de WhatsApp de compradores.

El comprador está viendo estas propiedades en su microsite personalizado:

${propsList}

Tu tarea:
1. Identificar qué propiedad(es) menciona el comprador (por referencia directa, posición, zona, precio u otra característica). Usa el propertyId exacto del listado.
2. Clasificar el sentimiento por cada propiedad mencionada: ME_INTERESA o NO_ME_ENCAJA.
3. Determinar la intención global (ME_ENCAJA si le gustan en general, NO_ME_ENCAJA si no cumplen, BUSCO_DIFERENTE si quiere algo completamente distinto).
4. Extraer variables de demanda si el comprador indica ajustes (precio, zona, metros, tipo).
5. Detectar si pide ver más opciones (wantsMoreOptions).

Reglas:
- Solo incluye propiedades que el comprador mencione. Si dice "todas" o "ninguna", incluye todas con el sentimiento correspondiente.
- Contexto: sector inmobiliario español, precios en euros, metros en m².
- No inventes datos que el comprador no mencione.${historyBlock}`;
}

const SIMPLE_SYSTEM_PROMPT = `Eres un asistente de análisis inmobiliario.
Clasifica la respuesta del comprador en: ME_ENCAJA, NO_ME_ENCAJA, BUSCO_DIFERENTE.
Si es NO_ME_ENCAJA, extrae variables de demanda ajustada.
Contexto: sector inmobiliario español, euros, m².
Extrae sólo lo que el comprador mencione explícitamente.`;

// ── Nodo de clasificación contextual ────────────────────────────────────────

function stripNullVars(vars: z.infer<typeof VariablesSchema>) {
  return {
    ...(vars.precioMin != null && { precioMin: vars.precioMin }),
    ...(vars.precioMax != null && { precioMax: vars.precioMax }),
    ...(vars.metrosMin != null && { metrosMin: vars.metrosMin }),
    ...(vars.metrosMax != null && { metrosMax: vars.metrosMax }),
    ...(vars.habitacionesMin != null && { habitacionesMin: vars.habitacionesMin }),
    ...(vars.zonas != null && { zonas: vars.zonas }),
    ...(vars.tipos != null && { tipos: vars.tipos }),
    ...(vars.extras != null && { extras: vars.extras }),
  };
}

async function clasificarContextual(state: NLUStateType): Promise<Partial<NLUStateType>> {
  const { messageText, selectionProperties, conversationHistory } = state.input;
  const properties = selectionProperties ?? [];
  const history = conversationHistory ?? [];

  if (properties.length === 0) {
    return clasificarSimple(state);
  }

  try {
    const systemPrompt = buildContextualSystemPrompt(properties, history);
    const result = await llmContextual.invoke([
      { role: "system", content: systemPrompt },
      { role: "user", content: messageText },
    ]);

    const validPropertyIds = new Set(properties.map((p) => p.propertyId));
    const feedback = result.propertyFeedback.filter((f) =>
      validPropertyIds.has(f.propertyId),
    );

    const nluResult: NLUResult = {
      intention: result.intention,
      confidence: result.confidence,
      propertyFeedback: feedback,
      variables: stripNullVars(result.variables),
      rawText: messageText,
      reasoning: result.reasoning,
      wantsMoreOptions: result.wantsMoreOptions,
    };

    return { nluResult };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { error: `Error en clasificación NLU contextual: ${errorMsg}` };
  }
}

async function clasificarSimple(state: NLUStateType): Promise<Partial<NLUStateType>> {
  const { messageText } = state.input;

  try {
    const result = await llmSimple.invoke([
      { role: "system", content: SIMPLE_SYSTEM_PROMPT },
      { role: "user", content: `Analiza esta respuesta del comprador:\n\n"${messageText}"` },
    ]);

    const nluResult: NLUResult = {
      intention: result.intention,
      confidence: result.confidence,
      propertyFeedback: [],
      variables: stripNullVars(result.variables),
      rawText: messageText,
      reasoning: result.reasoning,
      wantsMoreOptions: false,
    };

    return { nluResult };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { error: `Error en clasificación NLU simple: ${errorMsg}` };
  }
}

// ── Grafo compilado ─────────────────────────────────────────────────────────

export const nluGraph = new StateGraph(NLUState)
  .addNode("clasificar", clasificarContextual)
  .addEdge(START, "clasificar")
  .addEdge("clasificar", END)
  .compile();

// ── Funciones de entrada públicas ───────────────────────────────────────────

export async function classifyWhatsAppResponse(
  input: NLUGraphInput,
): Promise<NLUResult> {
  const result = await nluGraph.invoke({ input });

  if (result.error) throw new Error(result.error);
  if (!result.nluResult) throw new Error("El agente NLU no produjo resultado");

  return result.nluResult;
}

export async function classifyBuyerFeedback(
  input: NLUGraphInput,
): Promise<NLUResult> {
  const result = await nluGraph.invoke({ input });

  if (result.error) throw new Error(result.error);
  if (!result.nluResult) throw new Error("El agente NLU no produjo resultado");

  return result.nluResult;
}
