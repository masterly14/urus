/**
 * Pipeline del banco de pruebas: replica el tramo del handler real
 * `whatsapp-nlu-handler` dedicado al NLU de micrositios.
 *
 * Pasos (fiel al handler de producción):
 *   1. Persistir WHATSAPP_RECIBIDO contra el waId de test.
 *   2. Cargar propiedades del microsite sintético + historial conversacional.
 *   3. classifyBuyerFeedback (LangGraph).
 *   4. Emitir SELECCION_COMPRADOR por cada propertyFeedback.
 *   5. Emitir DEMANDA_ACTUALIZADA si intention ∈ {NO_ME_ENCAJA, BUSCO_DIFERENTE}
 *      y hay variables NLU.
 *   6. Encolar GENERATE_MICROSITE si wantsMoreOptions.
 *   7. Upsert WhatsAppBuyerSession (turnCount + lastMessageAt).
 *
 * Explícitamente NO delega en los routers paralelos del handler real
 * (mental health, dev program, visit scheduling): son ortogonales al NLU de
 * microsites y enmascararían los resultados del test.
 */

import { randomBytes } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { JsonValue } from "@/lib/event-store/types";
import { appendEvent } from "@/lib/event-store";
import { enqueueJob } from "@/lib/job-queue";
import {
  classifyBuyerFeedback,
  runConversationalAgent,
  type NLUResult,
  type PropertySummaryForNLU,
  type ConversationTurn,
  type ConversationalAgentOutput,
} from "@/lib/agents";
import type { ConversationPhase } from "@/lib/agents/conversational-agent-types";
import { coerceMicrositeCuratedProperties } from "@/lib/microsite/selection";
import type { TestNluSession } from "./session";

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export interface PipelineTurnResult {
  inboundEventId: string;
  nluResult: NLUResult;
  emittedEvents: EmittedEventSummary[];
  enqueuedJobs: EnqueuedJobSummary[];
  latencyMs: number;
  historyUsed: ConversationTurn[];
}

export interface EmittedEventSummary {
  id: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}

export interface EnqueuedJobSummary {
  id: string;
  type: string;
  idempotencyKey: string;
  availableAt: string | null;
  payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function inboundMessageId(): string {
  return `test-nlu-${Date.now()}-${randomBytes(4).toString("hex")}`;
}

async function loadSelectionProperties(
  selectionId: string,
): Promise<PropertySummaryForNLU[]> {
  const sel = await prisma.micrositeSelection.findUnique({
    where: { id: selectionId },
    select: { properties: true },
  });
  if (!sel) return [];
  const curated = coerceMicrositeCuratedProperties(sel.properties);
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

async function loadConversationHistory(
  waId: string,
  limit = 10,
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

  return events.reverse().map((evt) => {
    const p = (evt.payload ?? {}) as Record<string, unknown>;
    let text = "";
    if (evt.type === "WHATSAPP_RECIBIDO") {
      const textObj = p.text as Record<string, unknown> | undefined;
      text = typeof textObj?.body === "string" ? textObj.body : "";
    } else {
      text =
        typeof p.kind === "string"
          ? `[Enviado: ${p.kind}]`
          : typeof p.summary === "string"
            ? p.summary
            : "[Mensaje enviado]";
    }
    return {
      role: evt.type === "WHATSAPP_RECIBIDO" ? ("buyer" as const) : ("system" as const),
      text,
      timestamp: evt.occurredAt.toISOString(),
    };
  });
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export async function runTurn(
  session: TestNluSession,
  messageText: string,
): Promise<PipelineTurnResult> {
  const { buyerWaId, demandId, selectionId } = session;
  const correlationId = `test-nlu-${session.sessionId}`;

  // --- 1. Persistir WHATSAPP_RECIBIDO ---
  const messageId = inboundMessageId();
  const inboundEvent = await appendEvent({
    type: "WHATSAPP_RECIBIDO",
    aggregateType: "WHATSAPP_CONVERSATION",
    aggregateId: buyerWaId,
    payload: {
      messageId,
      from: buyerWaId,
      timestamp: new Date().toISOString(),
      type: "text",
      text: { body: messageText },
      source: "test-nlu-microsite",
    } as unknown as JsonValue,
    correlationId,
  });

  // --- 2. Cargar contexto del microsite sintético ---
  const selectionProperties = await loadSelectionProperties(selectionId);
  const conversationHistory = await loadConversationHistory(buyerWaId);

  // --- 3. NLU contextual ---
  const startMs = Date.now();
  const nluResult = await classifyBuyerFeedback({
    messageText,
    buyerPhone: buyerWaId,
    demandId,
    selectionProperties,
    conversationHistory,
  });
  const latencyMs = Date.now() - startMs;

  const emitted: EmittedEventSummary[] = [];
  const enqueued: EnqueuedJobSummary[] = [];

  // --- 4. SELECCION_COMPRADOR por cada feedback ---
  for (const fb of nluResult.propertyFeedback) {
    const scEvent = await appendEvent({
      type: "SELECCION_COMPRADOR",
      aggregateType: "DEMAND",
      aggregateId: demandId,
      payload: {
        demandId,
        selectionId,
        propertyId: fb.propertyId,
        decision: fb.sentiment,
        source: {
          channel: "whatsapp_feedback",
          waId: buyerWaId,
          messageId,
          eventId: inboundEvent.id,
          testHarness: true,
        },
        nlu: {
          intention: nluResult.intention,
          confidence: nluResult.confidence,
          reasoning: nluResult.reasoning ?? null,
        },
        respondedAt: new Date().toISOString(),
      } as unknown as JsonValue,
      correlationId,
      causationId: inboundEvent.id,
    });

    emitted.push(summarizeEvent(scEvent));

    const job = await enqueueJob({
      type: "PROCESS_EVENT",
      payload: { eventId: scEvent.id, eventType: scEvent.type },
      sourceEventId: scEvent.id,
      idempotencyKey: `process-event:${scEvent.id}`,
    });
    enqueued.push(summarizeJob(job));
  }

  // --- 5. DEMANDA_ACTUALIZADA si hay ajustes ---
  const hasVariables = Object.keys(nluResult.variables).length > 0;
  const shouldUpdateDemand =
    (nluResult.intention === "NO_ME_ENCAJA" ||
      nluResult.intention === "BUSCO_DIFERENTE") &&
    hasVariables;

  if (shouldUpdateDemand) {
    const daEvent = await appendEvent({
      type: "DEMANDA_ACTUALIZADA",
      aggregateType: "DEMAND",
      aggregateId: demandId,
      payload: {
        source: {
          channel: "whatsapp_feedback",
          waId: buyerWaId,
          messageId,
          selectionId,
          eventId: inboundEvent.id,
          testHarness: true,
        },
        nlu: {
          intention: nluResult.intention,
          confidence: nluResult.confidence,
          reasoning: nluResult.reasoning ?? null,
        },
        variables: nluResult.variables as unknown as JsonValue,
        rawText: nluResult.rawText,
        detectedAt: new Date().toISOString(),
      } as unknown as JsonValue,
      correlationId,
      causationId: inboundEvent.id,
    });

    emitted.push(summarizeEvent(daEvent));

    const job = await enqueueJob({
      type: "PROCESS_EVENT",
      payload: { eventId: daEvent.id, eventType: daEvent.type },
      sourceEventId: daEvent.id,
      idempotencyKey: `process-event:${daEvent.id}`,
    });
    enqueued.push(summarizeJob(job));
  }

  // --- 6. GENERATE_MICROSITE si pide más opciones ---
  if (nluResult.wantsMoreOptions) {
    const job = await enqueueJob({
      type: "GENERATE_MICROSITE",
      payload: {
        demandId,
        comercialId: session.comercialId,
        sourceEventId: inboundEvent.id,
        testHarness: true,
      },
      idempotencyKey: `generate_microsite:test-wants-more:${inboundEvent.id}`,
      sourceEventId: inboundEvent.id,
    });
    enqueued.push(summarizeJob(job));
  }

  // --- 7. Upsert WhatsAppBuyerSession ---
  await prisma.whatsAppBuyerSession.upsert({
    where: { waId: buyerWaId },
    create: {
      waId: buyerWaId,
      demandId,
      selectionId,
      selectionToken: session.selectionToken,
      lastMessageAt: new Date(),
      turnCount: 1,
    },
    update: {
      lastMessageAt: new Date(),
      turnCount: { increment: 1 },
    },
  });

  return {
    inboundEventId: inboundEvent.id,
    nluResult,
    emittedEvents: emitted,
    enqueuedJobs: enqueued,
    latencyMs,
    historyUsed: conversationHistory,
  };
}

// ---------------------------------------------------------------------------
// Conversational Agent Pipeline (alternativa con agente completo)
// ---------------------------------------------------------------------------

export interface ConversationalTurnResult {
  inboundEventId: string;
  responseText: string;
  toolResults: Array<{ toolName: string; args: Record<string, unknown>; result: unknown }>;
  nluResult?: NLUResult;
  nextPhase: string;
  emittedEvents: EmittedEventSummary[];
  enqueuedJobs: EnqueuedJobSummary[];
  latencyMs: number;
  historyUsed: ConversationTurn[];
}

export async function runConversationalTurn(
  session: TestNluSession,
  messageText: string,
): Promise<ConversationalTurnResult> {
  const { buyerWaId, demandId, selectionId } = session;
  const correlationId = `test-nlu-conv-${session.sessionId}`;

  // 1. Persistir WHATSAPP_RECIBIDO
  const messageId = inboundMessageId();
  const inboundEvent = await appendEvent({
    type: "WHATSAPP_RECIBIDO",
    aggregateType: "WHATSAPP_CONVERSATION",
    aggregateId: buyerWaId,
    payload: {
      messageId,
      from: buyerWaId,
      timestamp: new Date().toISOString(),
      type: "text",
      text: { body: messageText },
      source: "test-nlu-microsite-conversational",
    } as unknown as JsonValue,
    correlationId,
  });

  // 2. Cargar contexto
  const selectionProperties = await loadSelectionProperties(selectionId);
  const conversationHistory = await loadConversationHistory(buyerWaId);

  // 3. Cargar sesión para fase y digest
  const existingSession = await prisma.whatsAppBuyerSession.findUnique({
    where: { waId: buyerWaId },
    select: { turnCount: true, conversationPhase: true, buyerDigest: true },
  });

  const conversationPhase: ConversationPhase =
    (existingSession?.conversationPhase as ConversationPhase | null) ??
    (existingSession?.turnCount === 0 || !existingSession ? "INITIAL_CONTACT" :
     selectionProperties.length === 0 ? "IDLE_FOLLOWUP" : "REVIEWING_OPTIONS");

  // 4. Invocar agente conversacional
  const startMs = Date.now();
  const agentOutput: ConversationalAgentOutput = await runConversationalAgent({
    messageText,
    buyerWaId,
    demandId,
    selectionId,
    properties: selectionProperties,
    conversationHistory,
    buyerDigest: existingSession?.buyerDigest ?? null,
    conversationPhase,
  });
  const latencyMs = Date.now() - startMs;

  // 5. Registrar respuesta como WHATSAPP_ENVIADO
  await appendEvent({
    type: "WHATSAPP_ENVIADO",
    aggregateType: "WHATSAPP_CONVERSATION",
    aggregateId: buyerWaId,
    payload: {
      body: agentOutput.responseText,
      source: "conversational_agent_test",
      demandId,
      toolsUsed: agentOutput.toolResults.map((t) => t.toolName),
      phase: agentOutput.nextPhase,
    } as unknown as JsonValue,
    correlationId,
    causationId: inboundEvent.id,
  });

  // 6. Upsert session
  await prisma.whatsAppBuyerSession.upsert({
    where: { waId: buyerWaId },
    create: {
      waId: buyerWaId,
      demandId,
      selectionId,
      selectionToken: session.selectionToken,
      lastMessageAt: new Date(),
      turnCount: 1,
      conversationPhase: agentOutput.nextPhase,
    },
    update: {
      lastMessageAt: new Date(),
      turnCount: { increment: 1 },
      conversationPhase: agentOutput.nextPhase,
    },
  });

  // 7. Recoger eventos y jobs emitidos por tools (ya persistidos en tools)
  const emittedEvents = await prisma.event.findMany({
    where: {
      causationId: inboundEvent.id,
      type: { in: ["SELECCION_COMPRADOR", "DEMANDA_ACTUALIZADA", "WHATSAPP_ENVIADO"] },
    },
    orderBy: { position: "asc" },
  });

  const enqueuedJobs = await prisma.jobQueue.findMany({
    where: { sourceEventId: inboundEvent.id },
  });

  return {
    inboundEventId: inboundEvent.id,
    responseText: agentOutput.responseText,
    toolResults: agentOutput.toolResults,
    nluResult: agentOutput.nluResult,
    nextPhase: agentOutput.nextPhase,
    emittedEvents: emittedEvents.map(summarizeEvent),
    enqueuedJobs: enqueuedJobs.map(summarizeJob),
    latencyMs,
    historyUsed: conversationHistory,
  };
}

// ---------------------------------------------------------------------------
// Serialización para la UI
// ---------------------------------------------------------------------------

type EventLike = {
  id: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: Prisma.JsonValue;
  occurredAt: Date;
};

function summarizeEvent(evt: EventLike): EmittedEventSummary {
  return {
    id: evt.id,
    type: evt.type,
    aggregateType: evt.aggregateType,
    aggregateId: evt.aggregateId,
    payload: (evt.payload ?? {}) as Record<string, unknown>,
    occurredAt: evt.occurredAt.toISOString(),
  };
}

type JobLike = {
  id: string;
  type: string;
  idempotencyKey: string | null;
  availableAt: Date;
  payload: Prisma.JsonValue;
};

function summarizeJob(job: JobLike): EnqueuedJobSummary {
  return {
    id: job.id,
    type: job.type,
    idempotencyKey: job.idempotencyKey ?? "",
    availableAt: job.availableAt.toISOString(),
    payload: (job.payload ?? {}) as Record<string, unknown>,
  };
}

// ---------------------------------------------------------------------------
// Lectura de turnos para la UI
// ---------------------------------------------------------------------------

export interface TurnSummary {
  inboundEventId: string;
  occurredAt: string;
  text: string;
  emittedEvents: EmittedEventSummary[];
  enqueuedJobCount: number;
}

export async function listTurnsForSession(
  session: TestNluSession,
): Promise<TurnSummary[]> {
  const inboundEvents = await prisma.event.findMany({
    where: {
      aggregateType: "WHATSAPP_CONVERSATION",
      aggregateId: session.buyerWaId,
      type: "WHATSAPP_RECIBIDO",
    },
    orderBy: { position: "asc" },
    select: {
      id: true,
      payload: true,
      occurredAt: true,
    },
  });

  if (inboundEvents.length === 0) return [];

  const derivedEvents = await prisma.event.findMany({
    where: {
      aggregateType: "DEMAND",
      aggregateId: session.demandId,
      type: { in: ["SELECCION_COMPRADOR", "DEMANDA_ACTUALIZADA"] },
      causationId: { in: inboundEvents.map((e) => e.id) },
    },
    orderBy: { position: "asc" },
    select: {
      id: true,
      type: true,
      aggregateType: true,
      aggregateId: true,
      payload: true,
      occurredAt: true,
      causationId: true,
    },
  });

  const byCause = new Map<string, EmittedEventSummary[]>();
  for (const d of derivedEvents) {
    const key = d.causationId ?? "";
    const arr = byCause.get(key) ?? [];
    arr.push({
      id: d.id,
      type: d.type,
      aggregateType: d.aggregateType,
      aggregateId: d.aggregateId,
      payload: (d.payload ?? {}) as Record<string, unknown>,
      occurredAt: d.occurredAt.toISOString(),
    });
    byCause.set(key, arr);
  }

  // Conteo de jobs por inbound event (sourceEventId).
  const jobRows = await prisma.jobQueue.findMany({
    where: {
      sourceEventId: { in: inboundEvents.map((e) => e.id) },
    },
    select: { sourceEventId: true },
  });
  const jobsByEvent = new Map<string, number>();
  for (const j of jobRows) {
    const key = j.sourceEventId ?? "";
    jobsByEvent.set(key, (jobsByEvent.get(key) ?? 0) + 1);
  }

  return inboundEvents.map((evt) => {
    const payload = (evt.payload ?? {}) as Record<string, unknown>;
    const textObj = payload.text as Record<string, unknown> | undefined;
    const text = typeof textObj?.body === "string" ? textObj.body : "";
    return {
      inboundEventId: evt.id,
      occurredAt: evt.occurredAt.toISOString(),
      text,
      emittedEvents: byCause.get(evt.id) ?? [],
      enqueuedJobCount: jobsByEvent.get(evt.id) ?? 0,
    };
  });
}
