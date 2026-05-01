import { AggregateType, EventType, type LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store";
import { sendTemplateMessage, WHATSAPP_TEMPLATES } from "@/lib/whatsapp/send";
import type { JsonValue } from "@/lib/event-store/types";

const RECENT_SESSION_HOURS = 24;

type SkipReason =
  | "demand_not_found"
  | "missing_phone"
  | "terminal_status"
  | "opt_out"
  | "recent_session";

export type InitialContactResult = {
  ok: boolean;
  demandId: string;
  waId?: string;
  sent: boolean;
  skippedReason?: SkipReason;
  eventId: string;
  messageId?: string | null;
  dryRun?: boolean;
};

type DemandForInitialContact = {
  codigo: string;
  nombre: string;
  telefono: string;
  leadStatus: LeadStatus;
};

function normalizePhone(value: string | null | undefined): string {
  return (value ?? "").replace(/[^\d+]/g, "").trim();
}

function isTerminal(status: LeadStatus): boolean {
  return status === "PERDIDO" || status === "CERRADO";
}

function hasOptOut(raw: unknown): boolean {
  const record = (raw ?? {}) as Record<string, unknown>;
  const candidates = [
    record.noContactar,
    record.no_contactar,
    record.optOut,
    record.opt_out,
    record.bajaComunicaciones,
    record["no-whatsapp"],
  ];
  return candidates.some((value) => {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      return ["1", "true", "si", "sí", "yes", "no contactar", "baja"].includes(normalized);
    }
    return false;
  });
}

function welcomeText(): string {
  return "Soy tu agente inmobiliario personalizado de Urus. Te ayudare a encontrar una propiedad que encaje contigo haciendo unas preguntas cortas y mostrandote opciones concretas.";
}

async function appendContactEvent(input: {
  demandId: string;
  waId?: string;
  sent: boolean;
  skippedReason?: SkipReason;
  templateName: string;
  messageId?: string | null;
  dryRun?: boolean;
  causationId?: string | null;
  correlationId?: string | null;
}) {
  return appendEvent({
    type: EventType.NLU_CONTACTO_INICIADO,
    aggregateType: AggregateType.DEMAND,
    aggregateId: input.demandId,
    payload: {
      demandId: input.demandId,
      waId: input.waId ?? null,
      sent: input.sent,
      skippedReason: input.skippedReason ?? null,
      templateName: input.templateName,
      messageId: input.messageId ?? null,
      dryRun: input.dryRun ?? false,
    } as unknown as JsonValue,
    causationId: input.causationId ?? undefined,
    correlationId: input.correlationId ?? undefined,
  });
}

async function shouldSkipRecentSession(input: {
  waId: string;
  demandId: string;
}): Promise<boolean> {
  const since = new Date(Date.now() - RECENT_SESSION_HOURS * 60 * 60 * 1000);
  const existing = await prisma.whatsAppBuyerSession.findUnique({
    where: { waId: input.waId },
    select: {
      demandId: true,
      conversationPhase: true,
      lastMessageAt: true,
      updatedAt: true,
    },
  });
  if (!existing || existing.demandId !== input.demandId) return false;
  const lastActivity = existing.lastMessageAt ?? existing.updatedAt;
  return existing.conversationPhase === "initial_nlu_discovery" && lastActivity >= since;
}

export async function startNluInitialContactForDemand(input: {
  demandId: string;
  dryRun?: boolean;
  causationId?: string | null;
  correlationId?: string | null;
}): Promise<InitialContactResult> {
  const templateName = WHATSAPP_TEMPLATES.NLU_DEMANDA_CONTACTO_INICIAL;
  const demand = await prisma.demandCurrent.findUnique({
    where: { codigo: input.demandId },
    select: {
      codigo: true,
      nombre: true,
      telefono: true,
      leadStatus: true,
    },
  }) as DemandForInitialContact | null;

  if (!demand) {
    const event = await appendContactEvent({
      demandId: input.demandId,
      sent: false,
      skippedReason: "demand_not_found",
      templateName,
      dryRun: input.dryRun,
      causationId: input.causationId,
      correlationId: input.correlationId,
    });
    return { ok: false, demandId: input.demandId, sent: false, skippedReason: "demand_not_found", eventId: event.id, dryRun: input.dryRun };
  }

  const waId = normalizePhone(demand.telefono);
  const snapshot = await prisma.demandSnapshot.findUnique({
    where: { codigo: input.demandId },
    select: { raw: true },
  });
  const skippedReason: SkipReason | null =
    !waId
      ? "missing_phone"
      : isTerminal(demand.leadStatus)
        ? "terminal_status"
        : hasOptOut(snapshot?.raw)
          ? "opt_out"
          : await shouldSkipRecentSession({ waId, demandId: input.demandId })
            ? "recent_session"
            : null;

  if (skippedReason) {
    const event = await appendContactEvent({
      demandId: input.demandId,
      waId: waId || undefined,
      sent: false,
      skippedReason,
      templateName,
      dryRun: input.dryRun,
      causationId: input.causationId,
      correlationId: input.correlationId,
    });
    return { ok: true, demandId: input.demandId, waId, sent: false, skippedReason, eventId: event.id, dryRun: input.dryRun };
  }

  await prisma.whatsAppBuyerSession.upsert({
    where: { waId },
    create: {
      waId,
      demandId: input.demandId,
      lastMessageAt: new Date(),
      turnCount: 0,
      summary: null,
      conversationPhase: "initial_nlu_discovery",
      buyerDigest: welcomeText(),
    },
    update: {
      demandId: input.demandId,
      lastMessageAt: new Date(),
      conversationPhase: "initial_nlu_discovery",
      buyerDigest: welcomeText(),
    },
  });

  let messageId: string | null = null;
  if (!input.dryRun) {
    const result = await sendTemplateMessage(waId, {
      name: templateName,
      language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || "es" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: demand.nombre || "comprador" },
            { type: "text", text: welcomeText() },
          ],
        },
      ],
    }, {
      trace: {
        source: "nlu_initial_contact",
        kind: "nlu_demanda_contacto_inicial",
        aggregateId: waId,
        causationId: input.causationId ?? null,
        correlationId: input.correlationId ?? null,
        payload: { demandId: input.demandId },
      },
    });
    messageId = result.messages[0]?.id ?? null;
  }

  const event = await appendContactEvent({
    demandId: input.demandId,
    waId,
    sent: true,
    templateName,
    messageId,
    dryRun: input.dryRun,
    causationId: input.causationId,
    correlationId: input.correlationId,
  });

  return {
    ok: true,
    demandId: input.demandId,
    waId,
    sent: true,
    eventId: event.id,
    messageId,
    dryRun: input.dryRun,
  };
}
