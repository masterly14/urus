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
import { classifyWhatsAppResponse } from "@/lib/agents";

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

export async function handleWhatsAppRecibido(event: Event): Promise<HandlerResult> {
  const payload = event.payload as WhatsAppReceivedPayload;
  const waId = event.aggregateId;

  const messageText = extractMessageText(payload);
  if (!messageText) {
    console.log(
      `[consumer:whatsapp] WHATSAPP_RECIBIDO sin texto parseable waId=${waId} — no-op`,
    );
    return { success: true };
  }

  // 1) Resolver demandId desde un botón interactivo (si lo hay)
  const interactiveId =
    payload.interactive?.button_reply?.id ?? payload.interactive?.list_reply?.id;
  const matchFromButton =
    typeof interactiveId === "string" ? parseMatchButtonId(interactiveId) : null;

  // 2) Fallback: resolver demandId desde el reply context contra eventos enviados
  let resolved = matchFromButton;
  if (!resolved) {
    const contextMessageId = extractContextMessageId(payload);
    if (contextMessageId) {
      resolved = await resolveDemandContextFromReply(waId, contextMessageId);
    }
  }

  if (!resolved?.demandId) {
    console.log(
      `[consumer:whatsapp] WHATSAPP_RECIBIDO waId=${waId} sin demandId resolvible — no-op`,
    );
    return { success: true };
  }

  const nlu = await classifyWhatsAppResponse({
    messageText,
    buyerPhone: waId,
    demandId: resolved.demandId,
  });

  if (nlu.intention !== "NO_ME_ENCAJA") {
    console.log(
      `[consumer:whatsapp] NLU intention=${nlu.intention} waId=${waId} demandId=${resolved.demandId} — no-op`,
    );
    return { success: true };
  }

  const demandaEvent = await appendEvent({
    type: "DEMANDA_ACTUALIZADA",
    aggregateType: "DEMAND",
    aggregateId: resolved.demandId,
    payload: {
      source: {
        waId,
        messageId: payload.messageId ?? null,
        propertyId: resolved.propertyId ?? null,
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

  const followUpJobs: EnqueueJobInput[] = [
    {
      type: "PROCESS_EVENT",
      payload: { eventId: demandaEvent.id, eventType: demandaEvent.type },
      sourceEventId: demandaEvent.id,
      idempotencyKey: `process-event:${demandaEvent.id}`,
    },
  ];

  console.log(
    `[consumer:whatsapp] Emitido DEMANDA_ACTUALIZADA demandId=${resolved.demandId} (desde waId=${waId})`,
  );

  return { success: true, followUpJobs };
}

