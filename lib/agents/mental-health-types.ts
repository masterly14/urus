/**
 * M12 — Bot de Soporte Mental: tipos y schemas Zod.
 *
 * Define el contrato de datos entre el handler de WhatsApp, el grafo
 * LangGraph y la persistencia de sesión.
 */

import { z } from "zod";

// ── Flujos del bot ──────────────────────────────────────────────────────────

export const MENTAL_HEALTH_FLUJOS = [
  "bloqueo",
  "preparacion",
  "descarga",
  "enfoque",
  "crecimiento",
  "saludo",
] as const;

export type MentalHealthFlujo = (typeof MENTAL_HEALTH_FLUJOS)[number];

export const BLOQUEO_SUBTIPOS = [
  "miedo",
  "inseguridad",
  "presion",
  "ego",
  "fatiga",
] as const;

export type BloqueoSubtipo = (typeof BLOQUEO_SUBTIPOS)[number];

// ── Schema de clasificación (structured output del nodo clasificador) ───────

export const MentalHealthClassificationSchema = z.object({
  flujo: z.enum(MENTAL_HEALTH_FLUJOS).describe(
    "Flujo principal detectado: " +
    "bloqueo (miedo/inseguridad/presión/ego/fatiga), " +
    "preparacion (pre-cierre, preparar llamada/visita), " +
    "descarga (descarga emocional, desahogo), " +
    "enfoque (disperso, sin foco, necesita acción inmediata), " +
    "crecimiento (quiere mejorar, crecer, aprender), " +
    "saludo (inicio de conversación, saludo, despedida, charla ligera)."
  ),
  subtipoBloqueo: z.enum(BLOQUEO_SUBTIPOS).nullable().describe(
    "Solo cuando flujo='bloqueo': tipo específico de bloqueo. null para otros flujos."
  ),
  nivelEnergia: z.number().int().min(1).max(5).describe(
    "Nivel de energía percibido del comercial: 1=agotado, 3=neutro, 5=activo."
  ),
  focoDispersion: z.enum(["centrado", "disperso", "erratico"]).describe(
    "Estado de foco: centrado (sabe qué necesita), disperso (vago, divaga), " +
    "erratico (salta de tema o contradictorio)."
  ),
  urgencia: z.enum(["baja", "media", "alta"]).describe(
    "Urgencia percibida: baja (reflexivo, sin presión temporal), " +
    "media (tiene algo pendiente pero no inmediato), " +
    "alta (tiene un cierre/llamada en minutos, necesita ayuda YA)."
  ),
  reasoning: z.string().describe(
    "Razonamiento breve (1 frase) de por qué se eligió este flujo."
  ),
});

export type MentalHealthClassification = z.infer<typeof MentalHealthClassificationSchema>;

// ── Input del grafo ─────────────────────────────────────────────────────────

export interface MentalHealthConversationTurn {
  role: "comercial" | "coach";
  text: string;
  timestamp?: string;
}

export interface MentalHealthCrmContext {
  nombreComercial: string;
  cierresPendientesHoy: number;
  operacionPerdidaReciente: boolean;
  rachaPositiva: boolean;
  ciudad: string;
}

export interface MentalHealthGraphInput {
  messageText: string;
  comercialId: string | null;
  waId: string;
  conversationHistory: MentalHealthConversationTurn[];
  sessionContext: {
    flujoActivo: string | null;
    flujoStep: number | null;
    turnCount: number;
    nivelEnergia: number | null;
  };
  crmContext: MentalHealthCrmContext | null;
}

// ── Output del grafo ────────────────────────────────────────────────────────

export interface MentalHealthGraphOutput {
  responseText: string;
  classification: MentalHealthClassification;
}
