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

// ── Lookup de comercialId por waId ───────────────────────────────────────────
// TODO(auth): cuando exista el sistema de autenticación, el comercialId
// se obtendrá directamente del token/sesión. Este lookup por teléfono es temporal.

async function resolveComercialIdByWaId(waId: string): Promise<string | null> {
  const last9 = waId.replace(/\D/g, "").slice(-9);
  if (last9.length < 9) return null;

  const comercial = await prisma.comercial.findFirst({
    where: {
      activo: true,
      telefono: { endsWith: last9 },
    },
    select: { id: true },
  });

  return comercial?.id ?? null;
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

const MS_PER_DAY = 86_400_000;

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

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [visitasHoy, opsPendientes, opsCanceladas, cierresRecientes] =
      await Promise.all([
        prisma.commercialVisitFact.count({
          where: {
            comercialId,
            scheduledAt: { gte: todayStart, lte: todayEnd },
          },
        }),
        prisma.operacion.count({
          where: {
            comercialId,
            estado: { in: ["ARRAS", "PENDIENTE_FIRMA"] },
          },
        }),
        prisma.operacion.count({
          where: {
            comercialId,
            estado: "CANCELADA",
            updatedAt: { gte: new Date(Date.now() - 14 * MS_PER_DAY) },
          },
        }),
        prisma.commercialOperationFact.count({
          where: {
            comercialId,
            closedAt: { gte: new Date(Date.now() - 30 * MS_PER_DAY) },
          },
        }),
      ]);

    return {
      nombreComercial: comercial.nombre,
      ciudad: comercial.ciudad ?? "desconocida",
      cierresPendientesHoy: visitasHoy + opsPendientes,
      operacionPerdidaReciente: opsCanceladas > 0,
      rachaPositiva: cierresRecientes >= 2,
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

  const comercialId = existingSession?.comercialId ?? await resolveComercialIdByWaId(waId);

  if (!comercialId && !existingSession) {
    await sendTextMessage(
      waId,
      "Este servicio está disponible exclusivamente para el equipo comercial de Urus Capital. Si crees que es un error, contacta a tu responsable.",
    );
    return { success: true };
  }

  const session = existingSession
    ? existingSession
    : await prisma.mentalHealthSession.upsert({
        where: { waId },
        create: {
          waId,
          comercialId,
          turnCount: 0,
          lastMessageAt: new Date(),
        },
        update: {
          closedAt: null,
          comercialId,
          turnCount: 0,
          flujoActivo: null,
          flujoStep: null,
          subtipoBloqueo: null,
          nivelEnergia: null,
          lastMessageAt: new Date(),
        },
      });

  const WELCOME_TEXT =
    "Buenas. Esto queda entre nosotros, nadie más ve esta conversación. Cuéntame, ¿qué te ronda?";

  if (!existingSession) {
    await sendTextMessage(waId, WELCOME_TEXT);
    await appendEvent({
      type: "MENTAL_MSG_ENVIADO" as never,
      aggregateType: "MENTAL_CONVERSATION" as never,
      aggregateId: waId,
      payload: {
        text: WELCOME_TEXT,
        classification: null,
        sessionId: session.id,
        isWelcome: true,
      } as unknown as JsonValue,
      correlationId: event.correlationId ?? undefined,
      causationId: event.id,
    });
  }

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
      flujoStep: session.flujoStep,
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

  const flujoChanged = session.flujoActivo !== result.classification.flujo;
  const nextFlujoStep = flujoChanged ? 1 : (session.flujoStep ?? 0) + 1;

  await prisma.mentalHealthSession.update({
    where: { waId },
    data: {
      flujoActivo: result.classification.flujo,
      flujoStep: nextFlujoStep,
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
