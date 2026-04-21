/**
 * M5 — Smart Matching: handler de WHATSAPP_RECIBIDO.
 *
 * Objetivo (Día 9):
 * - Recibir texto libre del comprador (WhatsApp)
 * - Clasificar intención + extraer variables (NLU con LangGraph)
 * - Si intention = NO_ME_ENCAJA → emitir DEMANDA_ACTUALIZADA
 *
 * Nota: para poder ajustar la demanda, necesitamos resolver el demandId asociado
 * a la conversación. Por ahora se resuelve vía:
 * - botón interactivo con id `match:<demandId>:<propertyId>:...` (si existe)
 * - o contexto de reply (`context.messageId`) contra un evento WHATSAPP_ENVIADO previo
 */

import type { Event } from "@/types/domain";
import type { HandlerResult } from "./types";
import type { EnqueueJobInput } from "@/lib/job-queue/types";
import { appendEvent } from "@/lib/event-store";
import { updateDemandLeadStatus } from "@/lib/projections/update-lead-status";
import type { JsonValue } from "@/lib/event-store/types";
import { prisma } from "@/lib/prisma";
import { classifyBuyerFeedback } from "@/lib/agents";
import type { PropertySummaryForNLU, ConversationTurn } from "@/lib/agents";
import { coerceMicrositeCuratedProperties } from "@/lib/microsite/selection";
import { enqueueJob } from "@/lib/job-queue";
import { sendTextMessage } from "@/lib/whatsapp";
import { emitManagementAlert } from "@/lib/notifications/emit";
import {
  isCoachActivation,
  getActiveSession,
  handleMentalHealthMessage,
} from "./mental-health-handler";
import {
  isExerciseRequest,
  routeToDevProgramIfApplicable,
} from "@/lib/dev-program/exercise-router";
import { handleConversationalFlow } from "./conversational-handler";
import {
  classifyButtonReply,
  classifyVisitIntent,
} from "@/lib/agents/visit-intent-classifier";
import {
  getActiveSessionForBuyer,
  getActiveSessionForComercial,
} from "@/lib/visit-scheduling/session-manager";
import { handleVisitMessage } from "@/lib/visit-scheduling/handle-visit-message";
import {
  initiateVisitScheduling,
} from "@/lib/visit-scheduling/orchestrator";
import { ComposioNotConnectedError } from "@/lib/visit-scheduling/types";
import { TERMINAL_STATES } from "@/lib/visit-scheduling/constants";

type WhatsAppReceivedPayload = {
  messageId?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  interactive?: {
    type?: "button_reply" | "list_reply";
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string; description?: string };
  };
  button?: { payload?: string; text?: string };
  context?: { message_id?: string; id?: string };
  [k: string]: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return (value ?? {}) as Record<string, unknown>;
}

function extractContextMessageId(payload: WhatsAppReceivedPayload): string | null {
  const ctx = payload.context;
  const id = ctx?.message_id ?? ctx?.id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function extractMessageText(payload: WhatsAppReceivedPayload): string | null {
  if (payload.type === "text") {
    const t = payload.text?.body;
    return typeof t === "string" && t.trim() ? t.trim() : null;
  }

  if (payload.type === "interactive") {
    const title =
      payload.interactive?.button_reply?.title ??
      payload.interactive?.list_reply?.title;
    return typeof title === "string" && title.trim() ? title.trim() : null;
  }

  if (payload.type === "button") {
    const t = payload.button?.text;
    return typeof t === "string" && t.trim() ? t.trim() : null;
  }

  return null;
}

function parseMatchButtonId(id: string): { demandId: string; propertyId?: string } | null {
  // Formato: match:<demandId>:<propertyId>:<action>
  const parts = id.split(":").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  if (parts[0] !== "match") return null;
  const demandId = parts[1];
  const propertyId = parts.length >= 3 ? parts[2] : undefined;
  if (!demandId) return null;
  return { demandId, propertyId };
}

async function resolveDemandContextFromReply(
  waId: string,
  contextMessageId: string,
): Promise<{ demandId: string; propertyId?: string } | null> {
  // Busca el último WHATSAPP_ENVIADO de esta conversación con messageId = contextMessageId.
  const sentEvents = await prisma.event.findMany({
    where: {
      aggregateType: "WHATSAPP_CONVERSATION",
      aggregateId: waId,
      type: "WHATSAPP_ENVIADO",
    },
    orderBy: { position: "desc" },
    take: 50,
  });

  for (const evt of sentEvents) {
    const p = asRecord(evt.payload);
    const msgId = p.messageId;
    if (msgId !== contextMessageId) continue;
    const demandId = p.demandId;
    if (typeof demandId !== "string" || !demandId.trim()) continue;
    const propertyId = typeof p.propertyId === "string" ? p.propertyId : undefined;
    return { demandId, propertyId };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Post-Venta: intercepción de botones D3 (Todo OK / Necesito ayuda)
// ---------------------------------------------------------------------------

type PostventaButtonAction = {
  action: "ok" | "ayuda";
  propertyCode: string;
  operacionId?: string;
};

/**
 * Extrae la acción post-venta del payload de un botón WhatsApp.
 * El sufijo puede ser un `operacionId` (cuid, ~25 chars alfanuméricos)
 * o un `propertyCode` legacy (código Inmovilla numérico).
 */
export function extractPostventaPayload(
  p: WhatsAppReceivedPayload,
): PostventaButtonAction | null {
  const buttonPayload = p.button?.payload ?? "";
  const interactiveId = p.interactive?.button_reply?.id ?? "";
  const raw = buttonPayload || interactiveId;
  if (!raw) return null;

  let action: "ok" | "ayuda" | null = null;
  let suffix = "";

  if (raw.startsWith("POSTVENTA_OK:")) {
    action = "ok";
    suffix = raw.slice("POSTVENTA_OK:".length);
  } else if (raw.startsWith("POSTVENTA_AYUDA:")) {
    action = "ayuda";
    suffix = raw.slice("POSTVENTA_AYUDA:".length);
  }

  if (!action || !suffix) return null;

  const isCuid = /^c[a-z0-9]{20,}$/.test(suffix);

  return {
    action,
    propertyCode: isCuid ? "" : suffix,
    operacionId: isCuid ? suffix : undefined,
  };
}

async function resolvePropertyCodeFromOperacion(
  operacionId: string,
): Promise<string | null> {
  const op = await prisma.operacion.findUnique({
    where: { id: operacionId },
    select: { propertyCode: true },
  });
  return op?.propertyCode ?? null;
}

async function handlePostventaButton(
  pv: PostventaButtonAction,
  event: Event,
  waId: string,
): Promise<HandlerResult> {
  let propertyCode = pv.propertyCode;

  if (!propertyCode && pv.operacionId) {
    const resolved = await resolvePropertyCodeFromOperacion(pv.operacionId);
    if (!resolved) {
      console.warn(
        `[consumer:whatsapp] POSTVENTA operacionId=${pv.operacionId} — Operacion no encontrada`,
      );
      return { success: true };
    }
    propertyCode = resolved;
  }

  if (pv.action === "ok") {
    console.log(
      `[consumer:whatsapp] POSTVENTA_OK waId=${waId} propertyCode=${propertyCode}${pv.operacionId ? ` operacion=${pv.operacionId}` : ""}`,
    );
    return { success: true };
  }

  const incidenciaEvent = await appendEvent({
    type: "INCIDENCIA_POSTVENTA_ABIERTA",
    aggregateType: "PROPERTY",
    aggregateId: propertyCode,
    payload: {
      buyerPhone: waId,
      operacionId: pv.operacionId,
      source: "whatsapp_button",
      description: "",
      openedAt: new Date().toISOString(),
    } as unknown as JsonValue,
    correlationId: event.correlationId ?? undefined,
    causationId: event.id,
  });

  const followUpJobs: EnqueueJobInput[] = [
    {
      type: "PROCESS_EVENT",
      payload: { eventId: incidenciaEvent.id, eventType: incidenciaEvent.type },
      sourceEventId: incidenciaEvent.id,
      idempotencyKey: `process-event:${incidenciaEvent.id}`,
    },
  ];

  try {
    await emitManagementAlert({
      source: "post-venta",
      severity: "warning",
      title: "Incidencia post-venta abierta por WhatsApp",
      description:
        `Comprador ${waId} reporta incidencia para propiedad ${propertyCode}` +
        `${pv.operacionId ? ` (operacion ${pv.operacionId})` : ""}.`,
    });
  } catch (err) {
    console.error(
      `[consumer:whatsapp] Error emitiendo notificación interna de incidencia: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  console.log(
    `[consumer:whatsapp] POSTVENTA_AYUDA waId=${waId} propertyCode=${propertyCode}${pv.operacionId ? ` operacion=${pv.operacionId}` : ""} — incidencia abierta`,
  );

  return { success: true, followUpJobs };
}

// ---------------------------------------------------------------------------
// Resolución de contexto del microsite (propiedades + historial)
// ---------------------------------------------------------------------------

type ResolvedContext = {
  demandId: string;
  selectionId?: string;
  selectionToken?: string;
  propertyId?: string;
};

async function resolveFromSession(waId: string): Promise<ResolvedContext | null> {
  const session = await prisma.whatsAppBuyerSession.findUnique({
    where: { waId },
    select: { demandId: true, selectionId: true, selectionToken: true },
  });
  if (!session) return null;
  return {
    demandId: session.demandId,
    selectionId: session.selectionId ?? undefined,
    selectionToken: session.selectionToken ?? undefined,
  };
}

async function loadSelectionProperties(
  selectionId: string,
): Promise<PropertySummaryForNLU[]> {
  const sel = await prisma.micrositeSelection.findUnique({
    where: { id: selectionId },
    select: { properties: true },
  });
  if (!sel) return [];

  const curated = coerceMicrositeCuratedProperties(sel.properties as unknown);
  return curated.map((p) => ({
    propertyId: p.propertyId,
    title: p.title,
    price: p.price,
    zone: p.zone,
    city: p.city,
    metersBuilt: p.metersBuilt,
    rooms: p.rooms,
    extras: p.extras.slice(0, 5),
  }));
}

const COACH_PREFIX_RE = /^\/?coach\b/i;
const GENERIC_MARKETING_MESSAGE =
  "Hola, somos Urus Capital Group. Puedes conocer nuestro perfil aquí: https://www.idealista.com/pro/urus-capital-group/";

async function loadConversationHistory(
  waId: string,
  limit: number = 10,
): Promise<ConversationTurn[]> {
  const [events, mentalSession] = await Promise.all([
    prisma.event.findMany({
      where: {
        aggregateType: "WHATSAPP_CONVERSATION",
        aggregateId: waId,
        type: { in: ["WHATSAPP_RECIBIDO", "WHATSAPP_ENVIADO"] },
      },
      orderBy: { position: "desc" },
      take: limit,
      select: { type: true, payload: true, occurredAt: true },
    }),
    prisma.mentalHealthSession.findUnique({
      where: { waId },
      select: { createdAt: true, closedAt: true },
    }),
  ]);

  return events
    .reverse()
    .filter((evt) => {
      if (evt.type !== "WHATSAPP_RECIBIDO") return true;
      const p = (evt.payload ?? {}) as Record<string, unknown>;
      const textObj = p.text as Record<string, unknown> | undefined;
      const body = typeof textObj?.body === "string" ? textObj.body : "";
      if (COACH_PREFIX_RE.test(body.trim())) return false;
      if (mentalSession && !mentalSession.closedAt && evt.occurredAt >= mentalSession.createdAt) {
        return false;
      }
      return true;
    })
    .map((evt) => {
      const p = (evt.payload ?? {}) as Record<string, unknown>;
      let text = "";
      if (evt.type === "WHATSAPP_RECIBIDO") {
        const textObj = p.text as Record<string, unknown> | undefined;
        text = typeof textObj?.body === "string" ? textObj.body : "";
      } else {
        text = typeof p.kind === "string" ? `[Enviado: ${p.kind}]` : "[Mensaje enviado]";
      }
      return {
        role: evt.type === "WHATSAPP_RECIBIDO" ? "buyer" as const : "system" as const,
        text,
        timestamp: evt.occurredAt.toISOString(),
      };
    });
}

// ---------------------------------------------------------------------------
// M12: routing al Bot de Soporte Mental
// ---------------------------------------------------------------------------

async function routeToMentalHealthIfApplicable(
  event: Event,
  messageText: string,
  waId: string,
): Promise<HandlerResult | null> {
  if (isCoachActivation(messageText)) {
    return handleMentalHealthMessage(event, messageText, waId);
  }

  const activeSession = await getActiveSession(waId);
  if (activeSession) {
    return handleMentalHealthMessage(event, messageText, waId);
  }

  return null;
}

// ---------------------------------------------------------------------------
// M4: routing al flujo de agendamiento de visitas
// ---------------------------------------------------------------------------

async function routeToVisitSchedulingIfApplicable(
  event: Event,
  payload: WhatsAppReceivedPayload,
  messageText: string,
  waId: string,
): Promise<HandlerResult | null> {
  const interactiveId =
    payload.interactive?.button_reply?.id ?? payload.interactive?.list_reply?.id;

  // 1. ¿Hay sesión activa de visita para este waId?
  const [buyerSession, commercialSession] = await Promise.all([
    getActiveSessionForBuyer(waId),
    getActiveSessionForComercial(waId),
  ]);

  const activeSession = buyerSession ?? commercialSession;

  if (activeSession) {
    // 2a. Botón interactivo → clasificación determinista (sin LLM)
    let intent = interactiveId
      ? classifyButtonReply(interactiveId)
      : null;

    // 2b. Texto libre → clasificar con LLM (H29: tolerante a fallos)
    if (!intent) {
      try {
        intent = await classifyVisitIntent(messageText, activeSession.state);
      } catch (err) {
        console.error(
          `[consumer:whatsapp] classifyVisitIntent falló waId=${waId} sessionId=${activeSession.id}: ${err instanceof Error ? err.message : err}`,
        );

        // Fallback conservador: notificar al comercial para revisión manual y no bloquear el flujo.
        try {
          await sendTextMessage(
            activeSession.comercialWaId,
            `No se pudo clasificar automáticamente el mensaje del comprador (${waId}) en la sesión de visita ${activeSession.id}. Mensaje recibido: "${messageText}". Revísalo manualmente.`,
          );
        } catch (notifyErr) {
          console.error(
            `[consumer:whatsapp] Fallback notifyCommercial falló: ${notifyErr instanceof Error ? notifyErr.message : notifyErr}`,
          );
        }

        // Retornar success sin encolar follow-ups: el mensaje queda registrado
        // en Event Store pero no se procesa automáticamente.
        return { success: true };
      }
    }

    // 3. Si intención es visit-related → delegar al router de visitas
    if (intent.intent !== "NO_VISIT_RELATED") {
      const result = await handleVisitMessage(
        activeSession,
        intent,
        interactiveId ?? null,
        waId,
      );

      if (result.handled) {
        return { success: true };
      }
      // Si no se manejó (AMBIGUO o datos incompletos), dejamos pasar al flujo NLU general
    }

    // 4. NO_VISIT_RELATED o no manejado → continuar con flujo NLU general
    return null;
  }

  // 5. Sin sesión activa: ¿el mensaje es QUIERE_VISITAR?
  //    Solo clasificar si hay un botón de visita o texto que sugiera visita.
  //    Para evitar llamadas LLM innecesarias, solo clasificamos si hay
  //    un contexto de demanda resolvible (se verificará después en el flujo general).
  if (interactiveId) {
    const buttonIntent = classifyButtonReply(interactiveId);
    if (buttonIntent) {
      // Es un botón de visita sin sesión activa → ya se procesará al crearse
      return null;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------

export async function handleWhatsAppRecibido(event: Event): Promise<HandlerResult> {
  const payload = event.payload as WhatsAppReceivedPayload;
  const waId = event.aggregateId;

  // Guard: skip if already processed inline by the webhook (prevents duplicate responses)
  const alreadyProcessed = await prisma.event.findFirst({
    where: {
      causationId: event.id,
      type: { in: ["MENTAL_MSG_ENVIADO", "WHATSAPP_ENVIADO"] as never[] },
    },
    select: { id: true },
  });
  if (alreadyProcessed) {
    console.log(
      `[consumer:whatsapp] WHATSAPP_RECIBIDO waId=${waId} eventId=${event.id} — already processed inline, skipping`,
    );
    return { success: true };
  }

  const postventaAction = extractPostventaPayload(payload);
  if (postventaAction) {
    return handlePostventaButton(postventaAction, event, waId);
  }

  const messageText = extractMessageText(payload);
  if (!messageText) {
    console.log(
      `[consumer:whatsapp] WHATSAPP_RECIBIDO sin texto parseable waId=${waId} — no-op`,
    );
    return { success: true };
  }

  // --- M4: routing a flujo de agendamiento de visitas ---
  const visitRouted = await routeToVisitSchedulingIfApplicable(
    event,
    payload,
    messageText,
    waId,
  );
  if (visitRouted) return visitRouted;

  // --- M12: routing a Desarrollo Continuo (ejercicios / completado) ---
  if (isExerciseRequest(messageText)) {
    const devResult = await routeToDevProgramIfApplicable(event, messageText, waId);
    if (devResult) return devResult;
  }

  // --- M12: routing al Bot de Soporte Mental ---
  const mentalHealthRouted = await routeToMentalHealthIfApplicable(
    event,
    messageText,
    waId,
  );
  if (mentalHealthRouted) return mentalHealthRouted;

  // --- M12: "hecho" puede ser del programa de desarrollo (si no hay sesión mental activa) ---
  const devCompletionResult = await routeToDevProgramIfApplicable(event, messageText, waId);
  if (devCompletionResult) return devCompletionResult;

  // --- Resolución de demandId (3 caminos) ---

  const interactiveId =
    payload.interactive?.button_reply?.id ?? payload.interactive?.list_reply?.id;
  const matchFromButton =
    typeof interactiveId === "string" ? parseMatchButtonId(interactiveId) : null;

  let ctx: ResolvedContext | null = matchFromButton
    ? { demandId: matchFromButton.demandId, propertyId: matchFromButton.propertyId }
    : null;

  if (!ctx) {
    const contextMessageId = extractContextMessageId(payload);
    if (contextMessageId) {
      const fromReply = await resolveDemandContextFromReply(waId, contextMessageId);
      if (fromReply) {
        ctx = { demandId: fromReply.demandId, propertyId: fromReply.propertyId };
      }
    }
  }

  if (!ctx) {
    ctx = await resolveFromSession(waId);
  }

  if (!ctx?.demandId) {
    console.log(
      `[consumer:whatsapp] WHATSAPP_RECIBIDO waId=${waId} sin demandId resolvible — no-op`,
    );
    try {
      await sendTextMessage(waId, GENERIC_MARKETING_MESSAGE);
    } catch (err) {
      console.error(
        `[consumer:whatsapp] Error enviando mensaje de marketing waId=${waId}: ${err instanceof Error ? err.message : err}`,
      );
    }
    return { success: true };
  }

  // Primer contacto del comprador: avanzar leadStatus de NUEVO → CONTACTADO.
  // Best-effort; no bloquea el flujo NLU si falla.
  prisma.demandCurrent
    .updateMany({
      where: { codigo: ctx.demandId, leadStatus: "NUEVO" },
      data: { leadStatus: "CONTACTADO" },
    })
    .then((r) => {
      if (r.count > 0) {
        console.log(
          `[lead-status] demandId=${ctx!.demandId} NUEVO → CONTACTADO (primer WhatsApp recibido)`,
        );
      }
    })
    .catch((e: unknown) => {
      console.warn(
        `[lead-status] Error actualizando CONTACTADO demandId=${ctx!.demandId}: ${e instanceof Error ? e.message : e}`,
      );
    });

  // --- Feature flag: agente conversacional ---

  if (process.env.CONVERSATIONAL_AGENT_ENABLED === "true") {
    return handleConversationalFlow(event, waId, messageText, {
      demandId: ctx.demandId,
      selectionId: ctx.selectionId,
      propertyId: ctx.propertyId,
    });
  }

  // --- Cargar contexto del microsite y historial ---

  let selectionProperties: PropertySummaryForNLU[] = [];
  if (ctx.selectionId) {
    selectionProperties = await loadSelectionProperties(ctx.selectionId);
  } else {
    const session = await prisma.whatsAppBuyerSession.findUnique({
      where: { waId },
      select: { selectionId: true },
    });
    if (session?.selectionId) {
      ctx.selectionId = session.selectionId;
      selectionProperties = await loadSelectionProperties(session.selectionId);
    }
  }

  const conversationHistory = await loadConversationHistory(waId);

  // --- NLU contextual (H28: tolerante a fallos) ---

  let nlu;
  try {
    nlu = await classifyBuyerFeedback({
      messageText,
      buyerPhone: waId,
      demandId: ctx.demandId,
      selectionProperties,
      conversationHistory,
    });
  } catch (err) {
    console.error(
      `[consumer:whatsapp] classifyBuyerFeedback falló waId=${waId} demandId=${ctx.demandId}: ${err instanceof Error ? err.message : err}`,
    );

    // Fallback graceful: pedir al comprador que reformule el mensaje.
    // No emitimos eventos derivados, pero sí actualizamos la session y retornamos success
    // para no reintentar con el mismo input problemático (el job no debe fallar).
    try {
      await sendTextMessage(
        waId,
        "Perdona, no he entendido bien tu mensaje. ¿Puedes reformularlo o darme más detalles sobre lo que buscas?",
      );
    } catch (notifyErr) {
      console.error(
        `[consumer:whatsapp] Fallback sendTextMessage falló waId=${waId}: ${notifyErr instanceof Error ? notifyErr.message : notifyErr}`,
      );
    }

    await prisma.whatsAppBuyerSession.upsert({
      where: { waId },
      create: {
        waId,
        demandId: ctx.demandId,
        selectionId: ctx.selectionId,
        lastMessageAt: new Date(),
        turnCount: 1,
      },
      update: {
        lastMessageAt: new Date(),
        turnCount: { increment: 1 },
      },
    });

    return { success: true };
  }

  const followUpJobs: EnqueueJobInput[] = [];

  // --- Emitir SELECCION_COMPRADOR por cada propiedad con feedback ---

  for (const fb of nlu.propertyFeedback) {
    const scEvent = await appendEvent({
      type: "SELECCION_COMPRADOR",
      aggregateType: "DEMAND",
      aggregateId: ctx.demandId,
      payload: {
        demandId: ctx.demandId,
        selectionId: ctx.selectionId ?? null,
        propertyId: fb.propertyId,
        decision: fb.sentiment,
        source: {
          channel: "whatsapp_feedback",
          waId,
          messageId: payload.messageId ?? null,
          eventId: event.id,
        },
        nlu: {
          intention: nlu.intention,
          confidence: nlu.confidence,
          reasoning: nlu.reasoning ?? null,
        },
        respondedAt: new Date().toISOString(),
      } as unknown as JsonValue,
      correlationId: event.correlationId ?? undefined,
      causationId: event.id,
    });

    followUpJobs.push({
      type: "PROCESS_EVENT",
      payload: { eventId: scEvent.id, eventType: scEvent.type },
      sourceEventId: scEvent.id,
      idempotencyKey: `process-event:${scEvent.id}`,
    });
  }

  if (nlu.propertyFeedback.length > 0) {
    console.log(
      `[consumer:whatsapp] Emitidos ${nlu.propertyFeedback.length} SELECCION_COMPRADOR waId=${waId} demandId=${ctx.demandId}`,
    );
  }

  // --- Inicio automático de visita si intención = ME_ENCAJA ---

  if (nlu.intention === "ME_ENCAJA") {
    const interestedProperties = nlu.propertyFeedback.filter(
      (fb) => fb.sentiment === "ME_INTERESA",
    );

    const firstInterested = interestedProperties[0];
    if (firstInterested) {
      const existingVisitSession = await getActiveSessionForBuyer(
        waId,
        firstInterested.propertyId,
      );

      if (!existingVisitSession) {
        try {
          const session = await initiateVisitScheduling(
            ctx.demandId,
            firstInterested.propertyId,
            waId,
            event.correlationId ?? undefined,
          );

          if (session) {
            console.log(
              `[consumer:whatsapp] Visita iniciada automáticamente sessionId=${session.id} demandId=${ctx.demandId} propertyId=${firstInterested.propertyId}`,
            );
          } else {
            console.warn(
              `[consumer:whatsapp] initiateVisitScheduling retornó null — comercial sin configurar para propertyId=${firstInterested.propertyId}`,
            );
          }
        } catch (err) {
          if (err instanceof ComposioNotConnectedError) {
            console.warn(
              `[consumer:whatsapp] Visita no iniciada — comercial sin calendario (Composio) para propertyId=${firstInterested.propertyId}`,
            );
          } else {
            console.error(
              `[consumer:whatsapp] Error iniciando visita automática para propertyId=${firstInterested.propertyId}: ${err instanceof Error ? err.message : err}`,
            );
          }
        }
      } else {
        console.log(
          `[consumer:whatsapp] Visita ya activa sessionId=${existingVisitSession.id} para waId=${waId} propertyId=${firstInterested.propertyId} — no se crea otra`,
        );
      }
    }
  }

  // --- Emitir DEMANDA_ACTUALIZADA si hay ajuste de demanda ---

  const hasVariables = Object.keys(nlu.variables).length > 0;
  const shouldUpdateDemand =
    (nlu.intention === "NO_ME_ENCAJA" || nlu.intention === "BUSCO_DIFERENTE") && hasVariables;

  if (shouldUpdateDemand) {
    const demandaEvent = await appendEvent({
      type: "DEMANDA_ACTUALIZADA",
      aggregateType: "DEMAND",
      aggregateId: ctx.demandId,
      payload: {
        source: {
          channel: "whatsapp_feedback",
          waId,
          messageId: payload.messageId ?? null,
          selectionId: ctx.selectionId ?? null,
          eventId: event.id,
        },
        nlu: {
          intention: nlu.intention,
          confidence: nlu.confidence,
          reasoning: nlu.reasoning ?? null,
        },
        variables: nlu.variables as unknown as JsonValue,
        rawText: nlu.rawText,
        detectedAt: new Date().toISOString(),
      } as unknown as JsonValue,
      correlationId: event.correlationId ?? undefined,
      causationId: event.id,
    });

    followUpJobs.push({
      type: "PROCESS_EVENT",
      payload: { eventId: demandaEvent.id, eventType: demandaEvent.type },
      sourceEventId: demandaEvent.id,
      idempotencyKey: `process-event:${demandaEvent.id}`,
    });

    console.log(
      `[consumer:whatsapp] Emitido DEMANDA_ACTUALIZADA demandId=${ctx.demandId} (waId=${waId})`,
    );
  }

  // --- Regeneración de microsite si el comprador pide más opciones ---

  if (nlu.wantsMoreOptions) {
    await enqueueJob({
      type: "GENERATE_MICROSITE",
      payload: {
        demandId: ctx.demandId,
        comercialId: "system",
        sourceEventId: event.id,
      },
      idempotencyKey: `generate_microsite:wants_more:${event.id}`,
      sourceEventId: event.id,
    });

    console.log(
      `[consumer:whatsapp] Encolado GENERATE_MICROSITE (wantsMoreOptions) demandId=${ctx.demandId}`,
    );
  }

  // --- Actualizar session ---

  await prisma.whatsAppBuyerSession.upsert({
    where: { waId },
    create: {
      waId,
      demandId: ctx.demandId,
      selectionId: ctx.selectionId,
      lastMessageAt: new Date(),
      turnCount: 1,
    },
    update: {
      lastMessageAt: new Date(),
      turnCount: { increment: 1 },
    },
  });

  return { success: true, followUpJobs };
}

