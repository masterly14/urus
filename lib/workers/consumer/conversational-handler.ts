/**
 * Handler del agente conversacional para WhatsApp.
 *
 * Integra el grafo conversacional en el pipeline de mensajes:
 * 1. Carga contexto (propiedades, historial, sesión).
 * 2. Invoca el agente conversacional.
 * 3. Envía responseText al comprador.
 * 4. Registra WHATSAPP_ENVIADO en Event Store.
 * 5. Actualiza WhatsAppBuyerSession.
 * 6. Retorna jobs derivados de tool calls.
 */

import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store/event-store";
import { sendTextMessage } from "@/lib/whatsapp/send";
import { runConversationalAgent } from "@/lib/agents/conversational-graph";
import type { ConversationalAgentInput, ConversationPhase } from "@/lib/agents/conversational-agent-types";
import type { PropertySummaryForNLU, ConversationTurn } from "@/lib/agents/types";
import type { JsonValue } from "@/lib/event-store/types";
import type { EnqueueJobInput } from "@/lib/job-queue/types";
import type { Event } from "@/types/domain";

// ── Tipos del resultado ─────────────────────────────────────────────────────

export interface ConversationalHandlerResult {
  success: boolean;
  followUpJobs?: EnqueueJobInput[];
  responseText?: string;
  error?: string;
}

// ── Contexto resuelto pasado desde whatsapp-nlu-handler ─────────────────────

export interface ConversationalHandlerContext {
  demandId: string;
  selectionId?: string | null;
  propertyId?: string | null;
}

// ── Funciones de carga de datos (reutilizadas del handler principal) ─────────

async function loadSelectionProperties(
  selectionId: string,
): Promise<PropertySummaryForNLU[]> {
  const sel = await prisma.micrositeSelection.findUnique({
    where: { id: selectionId },
    select: { properties: true },
  });
  if (!sel) return [];

  const props = sel.properties as unknown as Array<Record<string, unknown>>;
  if (!Array.isArray(props)) return [];

  return props.map((p) => ({
    propertyId: String(p.propertyId ?? p.codigoInmueble ?? ""),
    title: String(p.title ?? p.titulo ?? ""),
    price: typeof p.price === "number" ? p.price : (typeof p.precio === "number" ? p.precio : null),
    zone: typeof p.zone === "string" ? p.zone : (typeof p.zona === "string" ? p.zona : null),
    city: typeof p.city === "string" ? p.city : (typeof p.ciudad === "string" ? p.ciudad : null),
    metersBuilt: typeof p.metersBuilt === "number" ? p.metersBuilt : (typeof p.metrosConstruidos === "number" ? p.metrosConstruidos : null),
    rooms: typeof p.rooms === "number" ? p.rooms : (typeof p.habitaciones === "number" ? p.habitaciones : null),
    extras: Array.isArray(p.extras) ? (p.extras as string[]).slice(0, 5) : [],
  }));
}

const COACH_PREFIX_RE = /^\/?coach\b/i;

async function loadConversationHistory(
  waId: string,
  limit: number = 10,
): Promise<ConversationTurn[]> {
  const events = await prisma.event.findMany({
    where: {
      aggregateType: "WHATSAPP_CONVERSATION",
      aggregateId: waId,
      type: { in: ["WHATSAPP_RECIBIDO", "WHATSAPP_ENVIADO"] },
    },
    orderBy: { position: "desc" },
    take: limit,
    select: { type: true, payload: true, occurredAt: true },
  });

  return events
    .reverse()
    .filter((evt) => {
      if (evt.type !== "WHATSAPP_RECIBIDO") return true;
      const p = (evt.payload ?? {}) as Record<string, unknown>;
      const textObj = p.text as Record<string, unknown> | undefined;
      const body = typeof textObj?.body === "string" ? textObj.body : "";
      return !COACH_PREFIX_RE.test(body.trim());
    })
    .map((evt) => {
      const p = (evt.payload ?? {}) as Record<string, unknown>;
      if (evt.type === "WHATSAPP_RECIBIDO") {
        const textObj = p.text as Record<string, unknown> | undefined;
        const body = typeof textObj?.body === "string" ? textObj.body : String(p.body ?? "");
        return { role: "buyer" as const, text: body, timestamp: evt.occurredAt.toISOString() };
      }
      const body = typeof p.body === "string" ? p.body : typeof p.text === "string" ? p.text : "";
      return { role: "system" as const, text: body, timestamp: evt.occurredAt.toISOString() };
    });
}

// ── Handler principal ───────────────────────────────────────────────────────

export async function handleConversationalFlow(
  event: Event,
  waId: string,
  messageText: string,
  ctx: ConversationalHandlerContext,
): Promise<ConversationalHandlerResult> {
  const startMs = Date.now();

  // 1. Cargar propiedades del microsite
  let selectionProperties: PropertySummaryForNLU[] = [];
  let selectionId = ctx.selectionId ?? null;

  if (selectionId) {
    selectionProperties = await loadSelectionProperties(selectionId);
  } else {
    const session = await prisma.whatsAppBuyerSession.findUnique({
      where: { waId },
      select: { selectionId: true },
    });
    if (session?.selectionId) {
      selectionId = session.selectionId;
      selectionProperties = await loadSelectionProperties(session.selectionId);
    }
  }

  // 2. Cargar historial de conversación
  const conversationHistory = await loadConversationHistory(waId);

  // 3. Cargar estado de sesión
  const existingSession = await prisma.whatsAppBuyerSession.findUnique({
    where: { waId },
    select: { summary: true, turnCount: true, conversationPhase: true, buyerDigest: true },
  });

  const conversationPhase: ConversationPhase = (
    existingSession?.conversationPhase as ConversationPhase | null
  ) ?? resolvePhase(
    existingSession?.turnCount ?? 0,
    selectionProperties.length,
  );
  const buyerDigest = existingSession?.buyerDigest ?? existingSession?.summary ?? null;

  // 4. Construir input y ejecutar agente
  const agentInput: ConversationalAgentInput = {
    messageText,
    buyerWaId: waId,
    demandId: ctx.demandId,
    selectionId,
    properties: selectionProperties,
    conversationHistory,
    buyerDigest,
    conversationPhase,
  };

  let output;
  try {
    output = await runConversationalAgent(agentInput);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[conversational-handler] Agent error waId=${waId}: ${msg}`);

    try {
      await sendTextMessage(
        waId,
        "Perdona, he tenido un problema procesando tu mensaje. ¿Puedes intentarlo de nuevo?",
      );
    } catch { /* best-effort */ }

    return { success: true, error: msg };
  }

  const elapsedMs = Date.now() - startMs;
  console.log(
    `[conversational-handler] waId=${waId} phase=${conversationPhase}→${output.nextPhase} ` +
    `tools=${output.toolResults.length} elapsed=${elapsedMs}ms`,
  );

  // 5. Enviar respuesta al comprador
  try {
    await sendTextMessage(waId, output.responseText);
  } catch (err) {
    console.error(
      `[conversational-handler] sendTextMessage failed waId=${waId}: ${err instanceof Error ? err.message : err}`,
    );
  }

  // 6. Registrar WHATSAPP_ENVIADO
  await appendEvent({
    type: "WHATSAPP_ENVIADO",
    aggregateType: "WHATSAPP_CONVERSATION",
    aggregateId: waId,
    payload: {
      body: output.responseText,
      source: "conversational_agent",
      demandId: ctx.demandId,
      toolsUsed: output.toolResults.map((t) => t.toolName),
      phase: output.nextPhase,
      elapsedMs,
    } as unknown as JsonValue,
    correlationId: event.correlationId ?? undefined,
    causationId: event.id,
  });

  // 7. Actualizar sesión
  await prisma.whatsAppBuyerSession.upsert({
    where: { waId },
    create: {
      waId,
      demandId: ctx.demandId,
      selectionId,
      lastMessageAt: new Date(),
      turnCount: 1,
      summary: buyerDigest,
      conversationPhase: output.nextPhase,
      buyerDigest: buyerDigest,
    },
    update: {
      lastMessageAt: new Date(),
      turnCount: { increment: 1 },
      conversationPhase: output.nextPhase,
    },
  });

  return {
    success: true,
    followUpJobs: [],
    responseText: output.responseText,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function resolvePhase(turnCount: number, propertyCount: number): ConversationPhase {
  if (turnCount === 0) return "INITIAL_CONTACT";
  if (propertyCount === 0) return "IDLE_FOLLOWUP";
  if (turnCount <= 2) return "REVIEWING_OPTIONS";
  return "GIVING_FEEDBACK";
}
