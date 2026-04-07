/**
 * M12 — Bot de Soporte Mental: handler de mensajes WhatsApp.
 *
 * Responsabilidades:
 * 1. Cargar/crear sesión MentalHealthSession
 * 2. Cargar historial conversacional desde el Event Store
 * 3. Invocar el grafo LangGraph (clasificador → respuesta)
 * 4. Enviar respuesta por WhatsApp
 * 5. Persistir sesión y emitir evento de trazabilidad
 */

import type { Event } from "@/types/domain";
import type { HandlerResult } from "./types";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store";
import type { JsonValue } from "@/lib/event-store/types";
import { sendTextMessage } from "@/lib/whatsapp";
import { processMentalHealthMessage } from "@/lib/agents/mental-health-graph";
import type {
  MentalHealthConversationTurn,
  MentalHealthCrmContext,
} from "@/lib/agents/mental-health-types";

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos
const COACH_PREFIX = /^\/?coach\b/i;
const EXIT_PREFIX = /^\/?salir\b/i;

// ── Activación y detección ──────────────────────────────────────────────────

export function isCoachActivation(messageText: string): boolean {
  return COACH_PREFIX.test(messageText.trim());
}

export function isCoachExit(messageText: string): boolean {
  return EXIT_PREFIX.test(messageText.trim());
}

function stripCoachPrefix(messageText: string): string {
  return messageText.trim().replace(COACH_PREFIX, "").trim();
}

// ── Session management ──────────────────────────────────────────────────────

export async function getActiveSession(waId: string) {
  const session = await prisma.mentalHealthSession.findUnique({
    where: { waId },
  });

  if (!session) return null;
  if (session.closedAt) return null;

  const elapsed = Date.now() - session.lastMessageAt.getTime();
  if (elapsed > SESSION_TIMEOUT_MS) {
    await prisma.mentalHealthSession.update({
      where: { waId },
      data: { closedAt: new Date() },
    });
    return null;
  }

  return session;
}

// ── Historial conversacional ────────────────────────────────────────────────

async function loadMentalHealthHistory(
  waId: string,
  limit: number = 12,
): Promise<MentalHealthConversationTurn[]> {
  const events = await prisma.event.findMany({
    where: {
      aggregateType: "MENTAL_CONVERSATION",
      aggregateId: waId,
    },
    orderBy: { position: "desc" },
    take: limit,
    select: { type: true, payload: true, occurredAt: true },
  });

  return events.reverse().map((evt) => {
    const p = (evt.payload ?? {}) as Record<string, unknown>;
    const text = typeof p.text === "string" ? p.text : "";
    return {
      role: (evt.type === "MENTAL_MSG_RECIBIDO" ? "comercial" : "coach") as
        | "comercial"
        | "coach",
      text,
      timestamp: evt.occurredAt.toISOString(),
    };
  });
}

// ── Contexto CRM (ligero, sin invadir) ─────────────────────────────────────

async function loadCrmContext(
  _waId: string,
  comercialId: string | null,
): Promise<MentalHealthCrmContext | null> {
  if (!comercialId) return null;

  try {
    const comercial = await prisma.comercial.findUnique({
      where: { id: comercialId },
      select: { nombre: true, ciudad: true },
    });

    if (!comercial) return null;

    return {
      nombreComercial: comercial.nombre,
      ciudad: comercial.ciudad ?? "desconocida",
      cierresPendientesHoy: 0,
      operacionPerdidaReciente: false,
      rachaPositiva: false,
    };
  } catch {
    return null;
  }
}

// ── Handler principal ───────────────────────────────────────────────────────

export async function handleMentalHealthMessage(
  event: Event,
  messageText: string,
  waId: string,
): Promise<HandlerResult> {
  if (isCoachExit(messageText)) {
    const session = await getActiveSession(waId);
    if (session) {
      await prisma.mentalHealthSession.update({
        where: { waId },
        data: { closedAt: new Date() },
      });
    }
    await sendTextMessage(waId, "Venga, aquí estamos cuando necesites. Dale caña.");
    return { success: true };
  }

  const cleanText = isCoachActivation(messageText)
    ? stripCoachPrefix(messageText) || "Hola"
    : messageText;

  const existingSession = await getActiveSession(waId);

  const session = existingSession
    ? existingSession
    : await prisma.mentalHealthSession.upsert({
        where: { waId },
        create: {
          waId,
          comercialId: null,
          turnCount: 0,
          lastMessageAt: new Date(),
        },
        update: {
          closedAt: null,
          turnCount: 0,
          flujoActivo: null,
          subtipoBloqueo: null,
          nivelEnergia: null,
          lastMessageAt: new Date(),
        },
      });

  await appendEvent({
    type: "MENTAL_MSG_RECIBIDO" as never,
    aggregateType: "MENTAL_CONVERSATION" as never,
    aggregateId: waId,
    payload: {
      text: cleanText,
      comercialId: session.comercialId,
      sessionId: session.id,
    } as unknown as JsonValue,
    correlationId: event.correlationId ?? undefined,
    causationId: event.id,
  });

  const conversationHistory = await loadMentalHealthHistory(waId);
  const crmContext = await loadCrmContext(waId, session.comercialId);

  const result = await processMentalHealthMessage({
    messageText: cleanText,
    comercialId: session.comercialId,
    waId,
    conversationHistory,
    sessionContext: {
      flujoActivo: session.flujoActivo,
      turnCount: session.turnCount,
      nivelEnergia: session.nivelEnergia,
    },
    crmContext,
  });

  await sendTextMessage(waId, result.responseText);

  await appendEvent({
    type: "MENTAL_MSG_ENVIADO" as never,
    aggregateType: "MENTAL_CONVERSATION" as never,
    aggregateId: waId,
    payload: {
      text: result.responseText,
      classification: result.classification,
      sessionId: session.id,
    } as unknown as JsonValue,
    correlationId: event.correlationId ?? undefined,
    causationId: event.id,
  });

  await prisma.mentalHealthSession.update({
    where: { waId },
    data: {
      flujoActivo: result.classification.flujo,
      subtipoBloqueo: result.classification.subtipoBloqueo,
      nivelEnergia: result.classification.nivelEnergia,
      turnCount: { increment: 1 },
      lastMessageAt: new Date(),
    },
  });

  console.log(
    `[consumer:mental-health] waId=${waId} flujo=${result.classification.flujo}` +
      (result.classification.subtipoBloqueo
        ? ` subtipo=${result.classification.subtipoBloqueo}`
        : "") +
      ` energia=${result.classification.nivelEnergia}/5` +
      ` turno=${session.turnCount + 1}`,
  );

  return { success: true };
}
