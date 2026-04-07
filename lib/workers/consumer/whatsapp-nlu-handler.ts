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
import type { JsonValue } from "@/lib/event-store/types";
import { prisma } from "@/lib/prisma";
import { classifyBuyerFeedback } from "@/lib/agents";
import type { PropertySummaryForNLU, ConversationTurn } from "@/lib/agents";
import { coerceMicrositeCuratedProperties } from "@/lib/microsite/selection";
import { enqueueJob } from "@/lib/job-queue";
import {
  isCoachActivation,
  getActiveSession,
  handleMentalHealthMessage,
} from "./mental-health-handler";

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

  const alertPhone = process.env.ALERT_WHATSAPP_TO;
  if (alertPhone) {
    await enqueueJob({
      type: "NOTIFY_LEAD_WHATSAPP",
      payload: {
        assignedAgentTelefono: alertPhone,
        leadAggregateId: propertyCode,
        score: 0,
        slaLevel: "INCIDENCIA_POSTVENTA",
      },
      idempotencyKey: `notify_incidencia_wa:${incidenciaEvent.id}`,
      sourceEventId: incidenciaEvent.id,
    });
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
// Handler principal
// ---------------------------------------------------------------------------

export async function handleWhatsAppRecibido(event: Event): Promise<HandlerResult> {
  const payload = event.payload as WhatsAppReceivedPayload;
  const waId = event.aggregateId;

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

  // --- M12: routing al Bot de Soporte Mental ---
  const mentalHealthRouted = await routeToMentalHealthIfApplicable(
    event,
    messageText,
    waId,
  );
  if (mentalHealthRouted) return mentalHealthRouted;

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
    return { success: true };
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

  // --- NLU contextual ---

  const nlu = await classifyBuyerFeedback({
    messageText,
    buyerPhone: waId,
    demandId: ctx.demandId,
    selectionProperties,
    conversationHistory,
  });

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

