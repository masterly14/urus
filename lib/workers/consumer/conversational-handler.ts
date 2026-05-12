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
import { enqueueJob } from "@/lib/job-queue";
import type { ConversationalAgentInput, ConversationPhase } from "@/lib/agents/conversational-agent-types";
import type { PropertySummaryForNLU, ConversationTurn } from "@/lib/agents/types";
import type { JsonValue } from "@/lib/event-store/types";
import type { EnqueueJobInput } from "@/lib/job-queue/types";
import type { Event } from "@/types/domain";
import type {
  PostVisitPolicyState,
  PostVisitStructuredContext,
} from "@/lib/visitas/post-visit-context-types";
import { MICROSITE_HANDOFF_ETA_MINUTES } from "@/lib/agents/conversational-operational-constants";
import {
  computeConversationSignals,
  shouldForceSearchFallback,
  type ConversationSignals,
  type DemandCriteriaSnapshot,
} from "@/lib/agents/conversation-signals";

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

function asPostVisitStructuredContext(value: unknown): PostVisitStructuredContext | null {
  const record = value as Partial<PostVisitStructuredContext> | null | undefined;
  if (!record || typeof record !== "object") return null;
  if (record.source !== "commercial_post_visit") return null;
  if (typeof record.rawText !== "string") return null;
  return record as PostVisitStructuredContext;
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

  // 2. Cargar historial de conversación + criterios de demanda en paralelo
  const [conversationHistory, demandCriteria, existingSession] = await Promise.all([
    loadConversationHistory(waId),
    loadDemandCriteria(ctx.demandId),
    prisma.whatsAppBuyerSession.findUnique({
      where: { waId },
      select: {
        summary: true,
        turnCount: true,
        conversationPhase: true,
        buyerDigest: true,
        postVisitContextStructured: true,
        postVisitPolicyState: true,
      },
    }),
  ]);

  const conversationPhase =
    mapSessionPhase(existingSession?.conversationPhase) ??
    resolvePhase(existingSession?.turnCount ?? 0, selectionProperties.length);
  const buyerDigest = existingSession?.buyerDigest ?? existingSession?.summary ?? null;
  const postVisitStructuredContext = asPostVisitStructuredContext(existingSession?.postVisitContextStructured);
  const policyHints = (existingSession?.postVisitPolicyState ?? null) as PostVisitPolicyState | null;

  // 3. Calcular señales (anti-bucle / gatillo de búsqueda) deterministas.
  const signals = computeConversationSignals({
    messageText,
    conversationHistory,
    demandCriteria,
  });

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
    postVisitStructuredContext,
    policyHints,
    demandCriteria,
    signals,
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
        {
          trace: {
            source: "conversational_agent",
            kind: "agent_error_fallback",
            causationId: event.id,
            correlationId: event.correlationId,
            payload: { demandId: ctx.demandId, selectionId: ctx.selectionId ?? null },
          },
        },
      );
    } catch { /* best-effort */ }

    return { success: true, error: msg };
  }

  const elapsedMs = Date.now() - startMs;
  console.log(
    `[conversational-handler] waId=${waId} phase=${conversationPhase}→${output.nextPhase} ` +
    `tools=${output.toolResults.length} elapsed=${elapsedMs}ms`,
  );

  const agentInvokedSearchTool = output.toolResults.some(
    (t) => t.toolName === "request_more_options" || t.toolName === "update_demand",
  );

  const fallback = shouldForceSearchFallback({
    signals,
    hasSelection: selectionProperties.length > 0,
    agentInvokedSearchTool,
  });

  if (fallback.force && fallback.reason) {
    await enqueueJob({
      type: "GENERATE_MICROSITE",
      payload: {
        demandId: ctx.demandId,
        comercialId: "system",
        sourceEventId: event.id,
        reason: `conversational_fallback:${fallback.reason}`,
      },
      idempotencyKey: `generate_microsite:conv_fallback:${event.id}`,
      sourceEventId: event.id,
    });

    output = {
      ...output,
      responseText: buildFallbackResponse({
        reason: fallback.reason,
        criteria: demandCriteria,
      }),
      nextPhase: "REVIEWING_OPTIONS",
      toolResults: [
        ...output.toolResults,
        {
          toolName: "request_more_options",
          args: { reason: `conversational_fallback:${fallback.reason}` },
          result: { status: "queued_for_validation", source: "handler_fallback" },
        },
      ],
    };

    console.log(
      `[conversational-handler] Fallback GENERATE_MICROSITE reason=${fallback.reason} demandId=${ctx.demandId} waId=${waId}`,
    );
  }

  // 5. Enviar respuesta al comprador
  let messageId: string | null = null;
  try {
    const sendResult = await sendTextMessage(waId, output.responseText);
    messageId = sendResult.messages?.[0]?.id ?? null;
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
      messageId,
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

function mapSessionPhase(phase: string | null | undefined): ConversationPhase | null {
  if (!phase) return null;
  if (phase === "reperfilado_post_visita") return "POST_VISIT_REPROFILING";
  if (
    phase === "INITIAL_CONTACT" ||
    phase === "REVIEWING_OPTIONS" ||
    phase === "GIVING_FEEDBACK" ||
    phase === "POST_VISIT_REPROFILING" ||
    phase === "SCHEDULING_VISIT" ||
    phase === "IDLE_FOLLOWUP" ||
    phase === "UNKNOWN"
  ) {
    return phase;
  }
  return null;
}

async function loadDemandCriteria(
  demandId: string,
): Promise<DemandCriteriaSnapshot | null> {
  try {
    const demand = await prisma.demandCurrent.findUnique({
      where: { codigo: demandId },
      select: {
        zonas: true,
        presupuestoMin: true,
        presupuestoMax: true,
        habitacionesMin: true,
        tipos: true,
      },
    });
    if (!demand) return null;
    return {
      zonas: demand.zonas ?? null,
      presupuestoMin: demand.presupuestoMin ?? null,
      presupuestoMax: demand.presupuestoMax ?? null,
      habitacionesMin: demand.habitacionesMin ?? null,
      tipos: demand.tipos ?? null,
    };
  } catch (err) {
    console.warn(
      `[conversational-handler] No se pudieron cargar criterios de demanda ${demandId}: ${
        err instanceof Error ? err.message : err
      }`,
    );
    return null;
  }
}

function summarizeCriteriaShort(c: DemandCriteriaSnapshot | null): string {
  if (!c) return "";
  const parts: string[] = [];
  const zonas = Array.isArray(c.zonas) ? c.zonas.join(", ") : (c.zonas ?? "");
  if (zonas && typeof zonas === "string" && zonas.trim()) parts.push(zonas.trim());
  if (c.presupuestoMin && c.presupuestoMax)
    parts.push(`${c.presupuestoMin.toLocaleString("es-ES")}–${c.presupuestoMax.toLocaleString("es-ES")}€`);
  else if (c.presupuestoMax)
    parts.push(`hasta ${c.presupuestoMax.toLocaleString("es-ES")}€`);
  if (c.habitacionesMin) parts.push(`≥${c.habitacionesMin} hab`);
  return parts.join(" · ");
}

/**
 * Genera una respuesta natural y profesional para el fallback determinista
 * de búsqueda. Varía según el motivo (pidió opciones, confirmó proceder o
 * detectamos bucle) y evita siempre el mismo "Perfecto 👍".
 */
function buildFallbackResponse(params: {
  reason: "buyer_asked" | "buyer_confirmed" | "loop_detected";
  criteria: DemandCriteriaSnapshot | null;
}): string {
  const summary = summarizeCriteriaShort(params.criteria);
  const eta = `unos ${MICROSITE_HANDOFF_ETA_MINUTES} minutos`;
  const tail = summary
    ? `Lo monto con lo que ya tengo apuntado (${summary}) y un compañero del equipo lo revisa antes de enviártelo. Te llega en ${eta}.`
    : `Un compañero del equipo lo revisa antes de enviártelo. Te llega en ${eta}.`;

  switch (params.reason) {
    case "buyer_asked":
      return `Voy a por ello. ${tail}`;
    case "buyer_confirmed":
      return `Perfecto, lanzo la búsqueda. ${tail}`;
    case "loop_detected":
      return `Mejor te muestro algo concreto en lugar de seguir confirmando. ${tail}`;
  }
}
