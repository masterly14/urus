/**
 * Clasificador de intención de visitas — NLU especializado.
 *
 * Dos modos:
 * 1. Determinista: respuestas a botones interactivos (sin LLM).
 * 2. LLM: texto libre clasificado con gpt-4o-mini + structured output.
 *
 * El prompt recibe el estado actual de la sesión para contextualizar
 * la clasificación (ej: en COLLECTING_VISITOR_DATA se prioriza
 * extracción de nombre/teléfono).
 */

import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";
import type { VisitSessionState } from "@/app/generated/prisma/client";
import type { VisitIntentClassification, VisitIntent } from "@/lib/visit-scheduling/types";

// ---------------------------------------------------------------------------
// LLM para clasificación de visitas (rápido y barato)
// ---------------------------------------------------------------------------

const visitLlm = new ChatOpenAI({
  model: "gpt-4o-mini",
  temperature: 0,
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 15_000,
});

// ---------------------------------------------------------------------------
// Schema de salida estructurada
// ---------------------------------------------------------------------------

const VisitIntentSchema = z.object({
  intent: z.enum([
    "QUIERE_VISITAR",
    "ACEPTA_HORARIO",
    "RECHAZA_HORARIO",
    "INDICA_PREFERENCIA",
    "PROPORCIONA_DATOS",
    "CANCELAR_VISITA",
    "REPROGRAMAR_VISITA",
    "AMBIGUO",
    "NO_VISIT_RELATED",
  ]).describe("Intención del mensaje en el contexto de agendamiento de visita."),
  extractedDate: z.string().nullable().describe(
    "Fecha extraída en formato YYYY-MM-DD si el usuario indica un día concreto. null si no aplica.",
  ),
  extractedTime: z.string().nullable().describe(
    "Hora extraída en formato HH:MM si el usuario indica una hora. null si no aplica.",
  ),
  extractedName: z.string().nullable().describe(
    "Nombre completo extraído si el usuario proporciona datos personales. null si no aplica.",
  ),
  extractedPhone: z.string().nullable().describe(
    "Teléfono extraído (dígitos, puede incluir espacios/guiones). null si no aplica.",
  ),
  extractedCount: z.number().nullable().describe(
    "Número de asistentes si lo menciona. null si no aplica.",
  ),
  confidence: z.number().min(0).max(1).describe("Confianza de la clasificación 0–1."),
});

const structuredLlm = visitLlm.withStructuredOutput(VisitIntentSchema, {
  name: "clasificar_intencion_visita",
});

// ---------------------------------------------------------------------------
// 1. classifyButtonReply — Determinista (sin LLM)
// ---------------------------------------------------------------------------

/**
 * Clasifica respuestas de botones interactivos sin necesidad de LLM.
 * Devuelve null si el button_id no corresponde al flujo de visitas.
 */
export function classifyButtonReply(
  buttonId: string,
): VisitIntentClassification | null {
  const lower = buttonId.toLowerCase();

  // Comercial selecciona slot: "slot_0:<sessionId>", "slot_1:<sessionId>", "slot_2:<sessionId>"
  if (/^slot_\d+:/.test(lower)) {
    return {
      intent: "ACEPTA_HORARIO",
      confidence: 1.0,
    };
  }

  // Comprador acepta horario
  if (lower.startsWith("si_me_va:")) {
    return {
      intent: "ACEPTA_HORARIO",
      confidence: 1.0,
    };
  }

  // Comprador rechaza horario
  if (lower.startsWith("no_puedo:")) {
    return {
      intent: "RECHAZA_HORARIO",
      confidence: 1.0,
    };
  }

  // Comercial confirma preferencia del comprador
  if (lower.startsWith("confirmar:")) {
    return {
      intent: "ACEPTA_HORARIO",
      confidence: 1.0,
    };
  }

  // Comercial rechaza preferencia del comprador
  if (lower.startsWith("no_puedo_confirmar:")) {
    return {
      intent: "RECHAZA_HORARIO",
      confidence: 1.0,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// 2. classifyVisitIntent — LLM (texto libre)
// ---------------------------------------------------------------------------

function buildSystemPrompt(sessionState: VisitSessionState | null): string {
  const stateContext = sessionState
    ? `\nEstado actual de la sesión: ${sessionState}\n`
    : "\nNo hay sesión de visita activa.\n";

  const stateHints: Record<string, string> = {
    SLOT_PROPOSED_TO_BUYER:
      "El comprador acaba de recibir una propuesta de horario. " +
      "Prioriza detectar ACEPTA_HORARIO o RECHAZA_HORARIO.",
    ASKING_BUYER_PREFERENCE:
      "Se le pidió al comprador un día/hora preferido. " +
      "Prioriza detectar INDICA_PREFERENCIA con fecha y hora.",
    COLLECTING_VISITOR_DATA:
      "Se le pidió nombre, teléfono y nº de asistentes. " +
      "Prioriza detectar PROPORCIONA_DATOS con nombre, teléfono y count.",
    VISIT_CONFIRMED:
      "La visita ya está confirmada. " +
      "Prioriza detectar CANCELAR_VISITA o REPROGRAMAR_VISITA.",
  };

  const hint = sessionState && stateHints[sessionState]
    ? `\nContexto: ${stateHints[sessionState]}`
    : "";

  return `Eres un clasificador de intención para un sistema de agendamiento de visitas inmobiliarias por WhatsApp.
${stateContext}${hint}
Clasifica el mensaje del usuario en una de estas intenciones:

- QUIERE_VISITAR: quiere agendar una visita ("me encaja", "quiero verlo", "¿podemos visitar?", "me interesa visitarlo").
- ACEPTA_HORARIO: acepta un horario propuesto ("sí", "me va bien", "perfecto", "ok", "vale", "confirmo").
- RECHAZA_HORARIO: rechaza un horario ("no puedo", "ese día no", "imposible", "no me viene bien").
- INDICA_PREFERENCIA: indica un día/hora preferido ("el martes a las 10", "prefiero por la mañana", "el 22 de abril").
- PROPORCIONA_DATOS: proporciona nombre, teléfono o nº de asistentes ("Me llamo Juan García, 654321000, vamos 2").
- CANCELAR_VISITA: quiere cancelar una visita ("quiero cancelar", "ya no puedo ir", "anula la visita").
- REPROGRAMAR_VISITA: quiere cambiar la fecha ("¿puedo cambiar la fecha?", "necesito mover la visita").
- AMBIGUO: el mensaje podría ser de visitas pero no es claro.
- NO_VISIT_RELATED: no tiene que ver con visitas.

Reglas:
- Si el mensaje contiene tanto datos personales (nombre + teléfono) como una preferencia de fecha, clasifica como PROPORCIONA_DATOS si el estado es COLLECTING_VISITOR_DATA, o INDICA_PREFERENCIA si es ASKING_BUYER_PREFERENCE.
- Respuestas mínimas afirmativas ("ok", "sí", "vale", "perfecto") → ACEPTA_HORARIO si hay sesión activa esperando confirmación.
- Respuestas mínimas negativas ("no", "no puedo", "paso") → RECHAZA_HORARIO si hay sesión activa esperando confirmación.
- Para INDICA_PREFERENCIA, extrae la fecha en YYYY-MM-DD y la hora en HH:MM si es posible. El año es ${new Date().getFullYear()}.
- Para PROPORCIONA_DATOS, extrae nombre completo, teléfono y número de asistentes.
- Solo clasificar como NO_VISIT_RELATED si el mensaje claramente no tiene relación con visitas inmobiliarias.`;
}

/**
 * Clasifica texto libre del usuario con LLM (gpt-4o-mini).
 * El estado de la sesión se pasa para contextualizar.
 */
export async function classifyVisitIntent(
  messageText: string,
  sessionState: VisitSessionState | null,
): Promise<VisitIntentClassification> {
  const systemPrompt = buildSystemPrompt(sessionState);

  const result = await structuredLlm.invoke([
    { role: "system", content: systemPrompt },
    { role: "user", content: messageText },
  ]);

  return {
    intent: result.intent as VisitIntent,
    extractedDate: result.extractedDate ?? undefined,
    extractedTime: result.extractedTime ?? undefined,
    extractedName: result.extractedName ?? undefined,
    extractedPhone: result.extractedPhone ?? undefined,
    extractedCount: result.extractedCount ?? undefined,
    confidence: result.confidence,
  };
}
