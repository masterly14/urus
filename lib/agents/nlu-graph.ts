/**
 * M5 — Agente NLU de clasificación de respuestas WhatsApp.
 *
 * Grafo LangGraph de un único nodo que recibe el texto libre del comprador
 * y extrae:
 *   - intention: ME_ENCAJA | NO_ME_ENCAJA | BUSCO_DIFERENTE
 *   - variables de demanda ajustada (precio, zona, metros, tipo, extras)
 *
 * La salida es tipada y determinista (temperature=0 + withStructuredOutput).
 */

import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { z } from "zod";
import { llm } from "./llm";
import type { NLUResult, NLUGraphInput } from "./types";

// ── Esquema Zod del output estructurado ──────────────────────────────────────

/**
 * OpenAI Structured Outputs requiere que TODOS los campos estén en `required`.
 * Los campos opcionales del dominio se modelan como `z.nullable()` con descripción
 * indicando que deben ser null si el comprador no los menciona explícitamente.
 */
const NLUOutputSchema = z.object({
  intention: z.enum(["ME_ENCAJA", "NO_ME_ENCAJA", "BUSCO_DIFERENTE"]).describe(
    "Intención del comprador: ME_ENCAJA si le gusta la propiedad, " +
    "NO_ME_ENCAJA si no cumple sus requisitos pero quiere ajustarlos, " +
    "BUSCO_DIFERENTE si quiere cambiar completamente de búsqueda."
  ),
  confidence: z.number().min(0).max(1).describe(
    "Confianza de la clasificación entre 0 y 1."
  ),
  variables: z.object({
    precioMin: z.number().nullable().describe("Precio mínimo en euros mencionado por el comprador. null si no lo menciona."),
    precioMax: z.number().nullable().describe("Precio máximo en euros mencionado por el comprador. null si no lo menciona."),
    metrosMin: z.number().nullable().describe("Metros cuadrados mínimos requeridos. null si no los menciona."),
    metrosMax: z.number().nullable().describe("Metros cuadrados máximos mencionados. null si no los menciona."),
    habitacionesMin: z.number().nullable().describe("Número mínimo de habitaciones. null si no lo menciona."),
    zonas: z.array(z.string()).nullable().describe("Zonas o barrios mencionados. null si no menciona ninguno."),
    tipos: z.array(z.string()).nullable().describe("Tipos de inmueble mencionados (piso, casa, ático, etc.). null si no los menciona."),
    extras: z.array(z.string()).nullable().describe("Extras mencionados (garaje, terraza, ascensor, etc.). null si no menciona ninguno."),
  }).describe("Variables de demanda extraídas. Usar null para las que el comprador no mencione explícitamente."),
  reasoning: z.string().describe("Breve explicación del razonamiento de clasificación para auditoría."),
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

// ── LLM con output estructurado ───────────────────────────────────────────────

const llmStructured = llm.withStructuredOutput(NLUOutputSchema, {
  name: "clasificar_respuesta_whatsapp",
});

// ── Nodo de clasificación ─────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres un asistente de análisis inmobiliario. 
Tu tarea es analizar la respuesta de un comprador en WhatsApp sobre una propiedad inmobiliaria y:
1. Clasificar su intención en: ME_ENCAJA, NO_ME_ENCAJA, o BUSCO_DIFERENTE.
2. Si la intención es NO_ME_ENCAJA, extraer las variables de su demanda actualizada.

Definiciones:
- ME_ENCAJA: el comprador muestra interés positivo o quiere avanzar.
- NO_ME_ENCAJA: la propiedad no cumple sus requisitos pero indica ajustes (precio más bajo, más metros, zona diferente, etc.).
- BUSCO_DIFERENTE: quiere un tipo de inmueble o zona completamente diferente.

Contexto: sector inmobiliario español. Los precios son en euros, los metros en m².
Extrae sólo lo que el comprador mencione explícitamente, no inventes datos.`;

async function clasificarNodo(state: NLUStateType): Promise<Partial<NLUStateType>> {
  const { messageText } = state.input;

  try {
    const result = await llmStructured.invoke([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Analiza esta respuesta del comprador:\n\n"${messageText}"` },
    ]);

    // Convierte los campos nullable del schema OpenAI al tipo DemandVariables del dominio
    // (elimina los nulls, sólo mantiene los valores que el comprador mencionó)
    const vars = result.variables;
    const nluResult: NLUResult = {
      intention: result.intention,
      confidence: result.confidence,
      variables: {
        ...(vars.precioMin != null && { precioMin: vars.precioMin }),
        ...(vars.precioMax != null && { precioMax: vars.precioMax }),
        ...(vars.metrosMin != null && { metrosMin: vars.metrosMin }),
        ...(vars.metrosMax != null && { metrosMax: vars.metrosMax }),
        ...(vars.habitacionesMin != null && { habitacionesMin: vars.habitacionesMin }),
        ...(vars.zonas != null && { zonas: vars.zonas }),
        ...(vars.tipos != null && { tipos: vars.tipos }),
        ...(vars.extras != null && { extras: vars.extras }),
      },
      rawText: messageText,
      reasoning: result.reasoning,
    };

    return { nluResult };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { error: `Error en clasificación NLU: ${errorMsg}` };
  }
}

// ── Grafo compilado ───────────────────────────────────────────────────────────

export const nluGraph = new StateGraph(NLUState)
  .addNode("clasificar", clasificarNodo)
  .addEdge(START, "clasificar")
  .addEdge("clasificar", END)
  .compile();

// ── Función de entrada pública ────────────────────────────────────────────────

export async function classifyWhatsAppResponse(
  input: NLUGraphInput
): Promise<NLUResult> {
  const result = await nluGraph.invoke({ input });

  if (result.error) {
    throw new Error(result.error);
  }

  if (!result.nluResult) {
    throw new Error("El agente NLU no produjo resultado");
  }

  return result.nluResult;
}
