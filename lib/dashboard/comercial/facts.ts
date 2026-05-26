import type { Event } from "@/types/domain";
import type { Prisma } from "@prisma/client";
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

function nonEmptyString(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function positiveNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && value > 0 ? value : null;
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return (value ?? {}) as Prisma.InputJsonValue;
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
      raw: toInputJson(event.payload),
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
      raw: toInputJson(event.payload),
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

  const [property, propertyCurrent, operacion] = await Promise.all([
    prisma.propertySnapshot.findUnique({
      where: { codigo: propertyCode },
      select: {
        ref: true,
        ciudad: true,
        zona: true,
        precio: true,
        agente: true,
        firstSeenAt: true,
      },
    }),
    prisma.propertyCurrent.findUnique({
      where: { codigo: propertyCode },
      select: {
        ref: true,
        ciudad: true,
        zona: true,
        precio: true,
        agente: true,
        comercialId: true,
        createdAt: true,
      },
    }),
    operacionId
      ? prisma.operacion.findUnique({
          where: { id: operacionId },
          select: { comercialId: true },
        })
      : Promise.resolve(null),
  ]);

  const agenteNombre =
    nonEmptyString(property?.agente) ??
    nonEmptyString(propertyCurrent?.agente) ??
    "";
  const payloadComercialId =
    typeof payload.comercialId === "string"
      ? normalizeSystemId(payload.comercialId)
      : null;
  const factComercialId =
    payloadComercialId ??
    normalizeSystemId(operacion?.comercialId) ??
    normalizeSystemId(propertyCurrent?.comercialId);
  const comercialById = factComercialId
    ? await prisma.comercial.findUnique({
        where: { id: factComercialId },
        select: { id: true, nombre: true },
      })
    : null;
  const comercialByAgent = comercialById
    ? null
    : await resolveComercialFromAgente(agenteNombre);
  const comercial = comercialById ?? comercialByAgent;
  const comercialId = comercial?.id ?? factComercialId;

  const firstSeenAt = property?.firstSeenAt ?? propertyCurrent?.createdAt ?? null;
  const daysToClose =
    firstSeenAt
      ? Math.max(0, Math.round((closedAt.getTime() - firstSeenAt.getTime()) / 86_400_000))
      : null;
  const propertyRef =
    nonEmptyString(property?.ref) ?? nonEmptyString(propertyCurrent?.ref) ?? "";
  const ciudad =
    nonEmptyString(property?.ciudad) ?? nonEmptyString(propertyCurrent?.ciudad) ?? "";
  const zona =
    nonEmptyString(property?.zona) ?? nonEmptyString(propertyCurrent?.zona) ?? "";
  const grossAmountEur =
    positiveNumber(property?.precio) ?? positiveNumber(propertyCurrent?.precio);

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
      comercialNombre: comercial?.nombre ?? agenteNombre,
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
      comercialNombre: comercial?.nombre ?? agenteNombre,
    },
  });
}

