import type { Event } from "@/types/domain";
import { prisma } from "@/lib/prisma";
import { resolveComercialFromAgente } from "@/lib/routing/resolve-comercial";

function toDateOrNull(value: unknown): Date | null {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" && value.trim()) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function normalizeSystemId(id: string | null | undefined): string | null {
  if (!id) return null;
  const trimmed = id.trim();
  if (!trimmed || trimmed === "system") return null;
  return trimmed;
}

export async function upsertCommercialLeadFactFromLeadIngestedEvent(input: {
  event: Event;
  scoredPayload?: {
    score?: number;
    slaLevel?: string;
    assignedAgentId?: string | null;
    assignedAgentNombre?: string | null;
    scoringModelVersion?: number;
    aiScoringUsed?: boolean;
    aiConfidence?: number;
  };
}): Promise<void> {
  const { event, scoredPayload } = input;
  const payload = (event.payload ?? {}) as Record<string, unknown>;

  const tipo = typeof payload.tipo === "string" ? payload.tipo : "";
  const ciudad = typeof payload.ciudad === "string" ? payload.ciudad : "";
  const source = typeof payload.source === "string" ? payload.source : "";
  const inmovillaDemandId =
    typeof payload.demandId === "string" && payload.demandId.trim()
      ? payload.demandId.trim()
      : null;

  const createdAt = event.occurredAt ?? new Date();

  const aiFields = {
    scoringModelVersion:
      typeof scoredPayload?.scoringModelVersion === "number" ? scoredPayload.scoringModelVersion : null,
    aiScoringUsed: scoredPayload?.aiScoringUsed ?? false,
    aiConfidence:
      typeof scoredPayload?.aiConfidence === "number" ? scoredPayload.aiConfidence : null,
  };

  await prisma.commercialLeadFact.upsert({
    where: { leadId: event.aggregateId },
    create: {
      leadId: event.aggregateId,
      ingestedEventId: event.id,
      inmovillaDemandId,
      tipo,
      ciudad,
      source,
      score: typeof scoredPayload?.score === "number" ? scoredPayload.score : null,
      slaLevel: typeof scoredPayload?.slaLevel === "string" ? scoredPayload.slaLevel : null,
      assignedComercialId:
        typeof scoredPayload?.assignedAgentId === "string" ? scoredPayload.assignedAgentId : null,
      assignedComercialNombre:
        typeof scoredPayload?.assignedAgentNombre === "string" ? scoredPayload.assignedAgentNombre : null,
      ...aiFields,
      createdAt,
      raw: event.payload,
    },
    update: {
      ingestedEventId: event.id,
      inmovillaDemandId,
      tipo,
      ciudad,
      source,
      score: typeof scoredPayload?.score === "number" ? scoredPayload.score : null,
      slaLevel: typeof scoredPayload?.slaLevel === "string" ? scoredPayload.slaLevel : null,
      assignedComercialId:
        typeof scoredPayload?.assignedAgentId === "string" ? scoredPayload.assignedAgentId : null,
      assignedComercialNombre:
        typeof scoredPayload?.assignedAgentNombre === "string" ? scoredPayload.assignedAgentNombre : null,
      ...aiFields,
      raw: event.payload,
    },
  });
}

export async function upsertCommercialLeadFactFromLeadContactedEvent(
  event: Event,
): Promise<void> {
  const payload = (event.payload ?? {}) as Record<string, unknown>;

  const contactedAt =
    toDateOrNull(payload.contactedAt) ??
    event.occurredAt ??
    new Date();

  const contactedByComercialId =
    typeof payload.comercialId === "string" ? normalizeSystemId(payload.comercialId) : null;
  const contactChannel = typeof payload.canal === "string" ? payload.canal : null;

  await prisma.commercialLeadFact.upsert({
    where: { leadId: event.aggregateId },
    create: {
      leadId: event.aggregateId,
      contactedAt,
      contactedEventId: event.id,
      contactedByComercialId,
      contactChannel,
      createdAt: event.occurredAt ?? new Date(),
    },
    update: {
      contactedAt,
      contactedEventId: event.id,
      contactedByComercialId,
      contactChannel,
    },
  });
}

export async function upsertCommercialVisitFactFromVisitaAgendadaEvent(
  event: Event,
): Promise<void> {
  const payload = (event.payload ?? {}) as Record<string, unknown>;

  const demandId = event.aggregateId;
  const fecha = typeof payload.fecha === "string" ? payload.fecha : "";
  const horaInicio = typeof payload.horaInicio === "string" ? payload.horaInicio : "";
  const horaFin = typeof payload.horaFin === "string" ? payload.horaFin : "";

  const scheduledAt =
    fecha && horaInicio ? toDateOrNull(`${fecha}T${horaInicio}:00`) : null;

  const payloadComercialId =
    typeof payload.comercialId === "string" ? normalizeSystemId(payload.comercialId) : null;

  let comercialId: string | null = payloadComercialId;
  let comercialNombre = "";

  if (comercialId) {
    const row = await prisma.comercial.findUnique({
      where: { id: comercialId },
      select: { nombre: true },
    });
    comercialNombre = row?.nombre ?? "";
  } else {
    const demand = await prisma.demandCurrent.findUnique({
      where: { codigo: demandId },
      select: { agente: true },
    });
    const byName = await resolveComercialFromAgente(demand?.agente ?? "");
    comercialId = byName?.id ?? null;
    comercialNombre = byName?.nombre ?? (demand?.agente ?? "");
  }

  await prisma.commercialVisitFact.upsert({
    where: { sourceEventId: event.id },
    create: {
      sourceEventId: event.id,
      demandId,
      comercialId,
      comercialNombre,
      fecha,
      horaInicio,
      horaFin,
      scheduledAt,
      ubicacion: typeof payload.ubicacion === "string" ? payload.ubicacion : "",
      notas: typeof payload.notas === "string" ? payload.notas : "",
      calendarEventId: typeof payload.calendarEventId === "string" ? payload.calendarEventId : null,
      calendarLink: typeof payload.calendarLink === "string" ? payload.calendarLink : null,
      calendarSuccess: Boolean(payload.calendarSuccess),
      createdAt: event.occurredAt ?? new Date(),
    },
    update: {
      demandId,
      comercialId,
      comercialNombre,
      fecha,
      horaInicio,
      horaFin,
      scheduledAt,
      ubicacion: typeof payload.ubicacion === "string" ? payload.ubicacion : "",
      notas: typeof payload.notas === "string" ? payload.notas : "",
      calendarEventId: typeof payload.calendarEventId === "string" ? payload.calendarEventId : null,
      calendarLink: typeof payload.calendarLink === "string" ? payload.calendarLink : null,
      calendarSuccess: Boolean(payload.calendarSuccess),
    },
  });
}

export async function upsertCommercialVisitEvaluationFactFromVisitaEvaluadaEvent(
  event: Event,
): Promise<void> {
  const payload = (event.payload ?? {}) as Record<string, unknown>;

  const demandId = event.aggregateId;
  const interes = typeof payload.interes === "string" ? payload.interes : "";
  const notas = typeof payload.notas === "string" ? payload.notas : "";

  const payloadComercialId =
    typeof payload.comercialId === "string" ? normalizeSystemId(payload.comercialId) : null;

  let comercialId: string | null = payloadComercialId;
  let comercialNombre = "";

  if (comercialId) {
    const row = await prisma.comercial.findUnique({
      where: { id: comercialId },
      select: { nombre: true },
    });
    comercialNombre = row?.nombre ?? "";
  } else {
    const demand = await prisma.demandCurrent.findUnique({
      where: { codigo: demandId },
      select: { agente: true },
    });
    const byName = await resolveComercialFromAgente(demand?.agente ?? "");
    comercialId = byName?.id ?? null;
    comercialNombre = byName?.nombre ?? (demand?.agente ?? "");
  }

  await prisma.commercialVisitEvaluationFact.upsert({
    where: { sourceEventId: event.id },
    create: {
      sourceEventId: event.id,
      demandId,
      comercialId,
      comercialNombre,
      interes,
      notas,
      createdAt: event.occurredAt ?? new Date(),
    },
    update: {
      demandId,
      comercialId,
      comercialNombre,
      interes,
      notas,
    },
  });
}

export async function upsertCommercialOperationFactFromOperacionCerradaEvent(
  event: Event,
): Promise<void> {
  const payload = (event.payload ?? {}) as Record<string, unknown>;

  const propertyCode =
    typeof payload.propertyCode === "string" && payload.propertyCode.trim()
      ? payload.propertyCode.trim()
      : event.aggregateId;

  const operacionId =
    typeof payload.operacionId === "string" && payload.operacionId.trim()
      ? payload.operacionId.trim()
      : null;

  const newEstado = typeof payload.newEstado === "string" ? payload.newEstado : "";
  const demandId =
    typeof payload.demandId === "string" && payload.demandId.trim()
      ? payload.demandId.trim()
      : null;
  const closedAt =
    toDateOrNull(payload.closedAt) ??
    event.occurredAt ??
    new Date();

  const property = await prisma.propertySnapshot.findUnique({
    where: { codigo: propertyCode },
    select: {
      ref: true,
      ciudad: true,
      zona: true,
      precio: true,
      agente: true,
      firstSeenAt: true,
    },
  });
  const propertyCurrent = property
    ? null
    : await prisma.propertyCurrent.findUnique({
        where: { codigo: propertyCode },
        select: {
          ref: true,
          ciudad: true,
          zona: true,
          precio: true,
          agente: true,
          createdAt: true,
        },
      });

  const payloadComercialId =
    typeof payload.comercialId === "string" ? normalizeSystemId(payload.comercialId) : null;
  let comercialId: string | null = payloadComercialId;
  let comercialNombre = (property?.agente ?? propertyCurrent?.agente ?? "").trim();

  if (payloadComercialId) {
    const row = await prisma.comercial.findUnique({
      where: { id: payloadComercialId },
      select: { nombre: true },
    });
    comercialNombre = row?.nombre ?? comercialNombre;
  } else {
    const comercial = await resolveComercialFromAgente(comercialNombre);
    comercialId = comercial?.id ?? null;
    comercialNombre = comercial?.nombre ?? comercialNombre;
  }

  const firstSeenAt = property?.firstSeenAt ?? propertyCurrent?.createdAt ?? null;
  const daysToClose =
    firstSeenAt
      ? Math.max(0, Math.round((closedAt.getTime() - firstSeenAt.getTime()) / 86_400_000))
      : null;
  const propertyRef = property?.ref ?? propertyCurrent?.ref ?? "";
  const ciudad = property?.ciudad ?? propertyCurrent?.ciudad ?? "";
  const zona = property?.zona ?? propertyCurrent?.zona ?? "";
  const grossAmountEur = property?.precio ?? propertyCurrent?.precio ?? null;

  await prisma.commercialOperationFact.upsert({
    where: { sourceEventId: event.id },
    create: {
      sourceEventId: event.id,
      operacionId,
      propertyCode,
      propertyRef,
      demandId,
      ciudad,
      zona,
      newEstado,
      closedAt,
      firstSeenAt,
      daysToClose,
      grossAmountEur,
      comercialId,
      comercialNombre,
      createdAt: event.occurredAt ?? new Date(),
    },
    update: {
      operacionId,
      propertyCode,
      propertyRef,
      demandId,
      ciudad,
      zona,
      newEstado,
      closedAt,
      firstSeenAt,
      daysToClose,
      grossAmountEur,
      comercialId,
      comercialNombre,
    },
  });
}

