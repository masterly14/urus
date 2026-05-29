import { AggregateType, EventType } from "@prisma/client";
import { fromZonedTime } from "date-fns-tz";
import { appendEvent } from "@/lib/event-store/event-store";
import { enqueueJob } from "@/lib/job-queue";
import { prisma } from "@/lib/prisma";
import type { CalendarEventInput } from "@/lib/composio";
import { cancelCalendarEvent, createCalendarEventDirect } from "@/lib/composio/calendar";
import { scheduleParteVisitaFromDetails } from "@/lib/parte-visita/schedule";
import { updateDemandLeadStatus } from "@/lib/projections/update-lead-status";
import { cancelVisitAtomically } from "@/lib/visit-scheduling/confirm-visit";
import {
  getVisitInterestPackageByDemand,
  type VisitInterestProperty,
} from "./interest-package";
import { getVisitWorkItem, markVisitWorkItemScheduled } from "./work-items";

export type ManualVisitScheduleInput = {
  visitWorkItemId?: string;
  demandId?: string;
  draftDemandId?: string;
  propertyId?: string;
  draftPropertyId?: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  comercialId: string;
  notas?: string;
};

export type ManualVisitScheduleResult = {
  eventId: string;
  visitSessionId: string;
  calendar: {
    success: boolean;
    eventId?: string;
    link?: string;
  };
};

export type ManualVisitCancelInput = {
  visitWorkItemId: string;
  comercialId: string;
  reason?: string;
  cancelledBy?: "commercial" | "system";
};

export type ManualVisitCancelResult = {
  eventId: string;
  visitSessionId: string;
  calendarCancelled: boolean;
  qstashMessageDeleted: boolean;
};

export type ManualVisitRescheduleInput = {
  visitWorkItemId: string;
  comercialId: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  notas?: string;
  reason?: string;
};

export type ManualVisitRescheduleResult = {
  reprogrammedEventId: string;
  previousSessionId: string;
  newSessionId: string;
  scheduleEventId: string;
  calendarCancelled: boolean;
  qstashMessageDeleted: boolean;
  calendar: {
    success: boolean;
    eventId?: string;
    link?: string;
  };
};

const PLACEHOLDER_ADDRESS = "Direccion pendiente de completar";

type PropertySnapshotFields = {
  address?: string;
  price?: number | null;
  operationType?: string | null;
};

function toDate(fecha: string, hora: string): Date {
  return fromZonedTime(`${fecha}T${hora}:00`, "Europe/Madrid");
}

function snapshotFromWorkItem(
  workItem: NonNullable<Awaited<ReturnType<typeof getVisitWorkItem>>>,
): PropertySnapshotFields {
  return (workItem.propertySnapshot ?? {}) as PropertySnapshotFields;
}

function resolveDraftOperationType(snapshot: PropertySnapshotFields): "VENTA" | "ALQUILER" {
  return snapshot.operationType?.toUpperCase() === "ALQUILER" ? "ALQUILER" : "VENTA";
}

function resolveParteVisitaDetails(input: {
  property: VisitInterestProperty | undefined;
  effectiveDraftPropertyId: string | null;
  snapshot: PropertySnapshotFields;
}): { direccion: string; precio: number; tipoOperacion: "VENTA" | "ALQUILER" } {
  const address = input.property?.address?.trim() ?? input.snapshot.address?.trim() ?? "";
  const direccion =
    address && address !== PLACEHOLDER_ADDRESS ? address : "";
  const precio = input.property?.price ?? input.snapshot.price ?? 0;
  const tipoOperacion = resolveDraftOperationType(input.snapshot);

  if (input.effectiveDraftPropertyId) {
    if (!direccion) {
      throw new Error(
        "La propiedad provisional no tiene dirección. Vuelve a crear la visita indicando la dirección del inmueble.",
      );
    }
    if (!(precio > 0)) {
      throw new Error(
        "La propiedad provisional no tiene precio. Vuelve a crear la visita indicando el precio del inmueble.",
      );
    }
  }

  return {
    direccion: direccion || address || PLACEHOLDER_ADDRESS,
    precio: precio > 0 ? precio : 0,
    tipoOperacion,
  };
}

function assertNoOverlap(input: {
  propertyCode: string;
  slotStart: Date;
  slotEnd: Date;
}) {
  return prisma.propertyVisitSlot.count({
    where: {
      propertyCode: input.propertyCode,
      cancelled: false,
      slotStart: { lt: input.slotEnd },
      slotEnd: { gt: input.slotStart },
    },
  });
}

function buildCalendarInput(input: {
  demandName: string;
  property: VisitInterestProperty;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  notas?: string;
}): CalendarEventInput {
  return {
    titulo: `Visita: ${input.property.title} — ${input.demandName}`,
    descripcion: [
      `Visita inmobiliaria para ${input.demandName}.`,
      `Propiedad: ${input.property.title}`,
      `Referencia: ${input.property.reference}`,
      `Ref. catastral: ${input.property.cadastralReference ?? "no disponible"}`,
      `Contacto: ${input.property.contact.phones.join(", ") || "sin teléfono"}`,
      input.notas ? `Notas: ${input.notas}` : "",
    ].filter(Boolean).join("\n"),
    fecha: input.fecha,
    horaInicio: input.horaInicio,
    horaFin: input.horaFin,
    ubicacion: input.property.address,
  };
}

function propertyFromWorkItem(workItem: NonNullable<Awaited<ReturnType<typeof getVisitWorkItem>>>): VisitInterestProperty {
  const property = workItem.propertySnapshot as unknown as {
    title?: string;
    reference?: string;
    cadastralReference?: string | null;
    address?: string;
    city?: string | null;
    zone?: string | null;
    price?: number | null;
    rooms?: number | null;
    metersBuilt?: number | null;
    portalUrl?: string | null;
  };
  const contact = workItem.contactSnapshot as unknown as {
    kind?: VisitInterestProperty["contact"]["kind"];
    name?: string | null;
    phones?: string[];
    source?: VisitInterestProperty["contact"]["source"];
    missingContactPhone?: boolean;
  };
  return {
    propertyId: workItem.propertyId,
    source: workItem.propertySource === "internal" ? "internal" : "external",
    title: property.title ?? workItem.propertyId,
    reference: property.reference ?? workItem.propertyId,
    cadastralReference: property.cadastralReference ?? null,
    address: property.address ?? "Direccion no disponible",
    city: property.city ?? null,
    zone: property.zone ?? null,
    price: property.price ?? null,
    rooms: property.rooms ?? null,
    metersBuilt: property.metersBuilt ?? null,
    portalUrl: property.portalUrl ?? null,
    contact: {
      kind: contact.kind ?? "desconocido",
      name: contact.name ?? null,
      phones: contact.phones ?? [],
      source: contact.source ?? "property_current",
    },
    missingContactPhone: contact.missingContactPhone ?? workItem.missingContactPhone,
    interestedAt: workItem.createdAt.toISOString(),
  };
}

function buildVisitAggregate(input: {
  demandId: string;
  draftDemandId: string | null;
  fallback: string;
}) {
  if (input.demandId) {
    return {
      aggregateType: AggregateType.DEMAND,
      aggregateId: input.demandId,
    };
  }
  return {
    aggregateType: AggregateType.LEAD,
    aggregateId: input.draftDemandId || input.fallback,
  };
}

async function cancelCalendarForSession(input: {
  comercialId: string;
  calendarEventId: string | null;
}) {
  if (!input.calendarEventId) return false;
  const comercial = await prisma.comercial.findUnique({
    where: { id: input.comercialId },
    select: { composioConnectionId: true },
  });
  if (!comercial?.composioConnectionId) return false;

  const result = await cancelCalendarEvent(
    comercial.composioConnectionId,
    input.calendarEventId,
  );
  if (!result.success) {
    console.warn(
      `[visitas] No se pudo cancelar evento de calendario ${input.calendarEventId}: ${result.error ?? "unknown"}`,
    );
    return false;
  }
  return true;
}

async function cancelParteVisitaSessionForVisit(visitSessionId: string) {
  const parte = await prisma.parteVisitaSession.findUnique({
    where: { visitSessionId },
    select: { id: true, state: true, qstashMessageId: true },
  });
  if (!parte) return false;
  if (parte.state === "CANCELADA" || parte.state === "FIRMADA" || parte.state === "DOCUMENTO_ENVIADO") {
    return false;
  }
  await prisma.parteVisitaSession.update({
    where: { id: parte.id },
    data: { state: "CANCELADA" },
  });

  if (!parte.qstashMessageId) return false;

  const deleted = await deleteQstashMessage(parte.qstashMessageId);
  if (deleted) {
    await prisma.parteVisitaSession.update({
      where: { id: parte.id },
      data: { qstashMessageId: null },
    });
  }
  return deleted;
}

async function deleteQstashMessage(messageId: string): Promise<boolean> {
  const token = process.env.QSTASH_TOKEN?.trim();
  if (!token) {
    console.warn(
      `[visitas] No se pudo borrar mensaje QStash ${messageId}: QSTASH_TOKEN no configurado`,
    );
    return false;
  }

  try {
    const response = await fetch(`https://qstash.upstash.io/v2/messages/${messageId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) return true;

    const body = await response.text().catch(() => "");
    console.warn(
      `[visitas] No se pudo borrar mensaje QStash ${messageId}: HTTP ${response.status} ${response.statusText} ${body.slice(0, 200)}`,
    );
    return false;
  } catch (err) {
    console.warn(
      `[visitas] No se pudo borrar mensaje QStash ${messageId}:`,
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

export async function scheduleManualVisit(
  input: ManualVisitScheduleInput,
): Promise<ManualVisitScheduleResult> {
  const workItem = input.visitWorkItemId ? await getVisitWorkItem(input.visitWorkItemId) : null;
  const effectiveDemandId = workItem?.demandId || input.demandId || "";
  const effectivePropertyId = workItem?.propertyId || input.propertyId || "";
  const effectiveDraftDemandId = workItem?.draftDemandId || input.draftDemandId || null;
  const effectiveDraftPropertyId = workItem?.draftPropertyId || input.draftPropertyId || null;
  const pkg = workItem || !effectiveDemandId
    ? null
    : await getVisitInterestPackageByDemand(effectiveDemandId);
  const demandName = workItem?.buyerName || pkg?.demand.demandName || effectiveDemandId || "Demanda provisional";
  const buyerPhone = workItem?.buyerPhone || pkg?.demand.buyerPhone || "";
  const property = workItem
    ? propertyFromWorkItem(workItem)
    : pkg?.properties.find((item) => item.propertyId === effectivePropertyId);
  if (!property && !effectiveDraftPropertyId) {
    throw new Error(`La propiedad ${effectivePropertyId} no consta como interés de la demanda ${effectiveDemandId}`);
  }

  const snapshot = workItem ? snapshotFromWorkItem(workItem) : {};
  const parteDetails = resolveParteVisitaDetails({
    property,
    effectiveDraftPropertyId,
    snapshot,
  });

  const comercial = await prisma.comercial.findUnique({
    where: { id: input.comercialId },
    select: {
      id: true,
      nombre: true,
      composioConnectionId: true,
      waId: true,
      telefono: true,
    },
  });
  if (!comercial) throw new Error("Comercial no encontrado");
  if (!comercial.composioConnectionId) {
    throw new Error("El comercial no tiene conectado su calendario");
  }

  const slotStart = toDate(input.fecha, input.horaInicio);
  const slotEnd = toDate(input.fecha, input.horaFin);
  if (!(slotEnd > slotStart)) {
    throw new Error("La hora de fin debe ser posterior a la hora de inicio");
  }

  const overlapping = await assertNoOverlap({
    propertyCode: effectivePropertyId || `DRAFT-PROPERTY:${effectiveDraftPropertyId}`,
    slotStart,
    slotEnd,
  });
  if (overlapping > 0) {
    throw new Error("La propiedad ya tiene una visita confirmada en ese horario");
  }

  const calendarInput = buildCalendarInput({
    demandName,
    property: property ?? {
      propertyId: effectiveDraftPropertyId || "",
      source: "external",
      title: "Propiedad provisional",
      reference: `DRAFT-${effectiveDraftPropertyId}`,
      cadastralReference: null,
      address: parteDetails.direccion,
      city: null,
      zone: null,
      price: parteDetails.precio > 0 ? parteDetails.precio : null,
      rooms: null,
      metersBuilt: null,
      portalUrl: null,
      contact: {
        kind: "propietario",
        name: "Propietario provisional",
        phones: [],
        source: "draft_property",
      },
      missingContactPhone: false,
      interestedAt: new Date().toISOString(),
    },
    fecha: input.fecha,
    horaInicio: input.horaInicio,
    horaFin: input.horaFin,
    notas: input.notas,
  });
  const calendarResult = await createCalendarEventDirect(comercial.composioConnectionId, {
    summary: calendarInput.titulo,
    description: calendarInput.descripcion,
    startDatetime: `${calendarInput.fecha}T${calendarInput.horaInicio}:00`,
    endDatetime: `${calendarInput.fecha}T${calendarInput.horaFin}:00`,
    location: calendarInput.ubicacion,
  });

  const visitSession = await prisma.visitSchedulingSession.create({
    data: {
      demandId: effectiveDemandId,
      draftDemandId: effectiveDraftDemandId,
      draftPropertyId: effectiveDraftPropertyId,
      propertyCode: effectivePropertyId || `DRAFT-PROPERTY:${effectiveDraftPropertyId}`,
      comercialId: input.comercialId,
      buyerWaId: buyerPhone,
      comercialWaId: comercial.waId || comercial.telefono || "",
      state: "VISIT_CONFIRMED",
      currentRound: 0,
      maxRounds: 0,
      confirmedSlotStart: slotStart,
      confirmedSlotEnd: slotEnd,
      visitorName: demandName,
      visitorPhone: buyerPhone,
      calendarEventId: calendarResult.eventId ?? null,
      calendarLink: calendarResult.link ?? null,
      completedAt: new Date(),
    },
  });

  await prisma.propertyVisitSlot.create({
    data: {
      propertyCode: effectivePropertyId || `DRAFT-PROPERTY:${effectiveDraftPropertyId}`,
      slotStart,
      slotEnd,
      sessionId: visitSession.id,
      comercialId: input.comercialId,
    },
  });

  const event = await appendEvent({
    type: EventType.VISITA_AGENDADA,
    aggregateType: effectiveDemandId ? AggregateType.DEMAND : AggregateType.LEAD,
    aggregateId: effectiveDemandId || effectiveDraftDemandId || visitSession.id,
    payload: {
      sessionId: visitSession.id,
      comercialId: input.comercialId,
      comercialNombre: comercial.nombre,
      demandId: effectiveDemandId || null,
      propertyCode: effectivePropertyId || null,
      draftDemandId: effectiveDraftDemandId,
      draftPropertyId: effectiveDraftPropertyId,
      fecha: input.fecha,
      horaInicio: input.horaInicio,
      horaFin: input.horaFin,
      visitorName: demandName,
      visitorPhone: buyerPhone,
      calendarEventId: calendarResult.eventId || null,
      calendarLink: calendarResult.link || null,
      calendarSuccess: calendarResult.success,
      source: "manual_visitas_ui",
      notas: input.notas ?? "",
    },
  });

  await enqueueJob({
    type: "PROCESS_EVENT",
    payload: { eventId: event.id },
    sourceEventId: event.id,
    idempotencyKey: `process_event:${event.id}`,
  });

  if (effectiveDemandId) {
    await updateDemandLeadStatus(effectiveDemandId, "VISITA_CONFIRMADA");
  }
  if (input.visitWorkItemId) {
    await markVisitWorkItemScheduled({
      id: input.visitWorkItemId,
      scheduledSessionId: visitSession.id,
    });
  }

  await scheduleParteVisitaFromDetails({
    visitSessionId: visitSession.id,
    propertyCode: effectivePropertyId || `DRAFT-PROPERTY:${effectiveDraftPropertyId}`,
    propertyRef: property?.reference ?? `DRAFT-${effectiveDraftPropertyId}`,
    draftDemandId: effectiveDraftDemandId,
    comercialId: input.comercialId,
    buyerPhone,
    visitDateTime: slotStart,
    direccion: parteDetails.direccion,
    tipoOperacion: parteDetails.tipoOperacion,
    precio: parteDetails.precio,
  });

  return {
    eventId: event.id,
    visitSessionId: visitSession.id,
    calendar: {
      success: calendarResult.success,
      eventId: calendarResult.eventId,
      link: calendarResult.link,
    },
  };
}

export async function cancelManualVisit(
  input: ManualVisitCancelInput,
): Promise<ManualVisitCancelResult> {
  const workItem = await getVisitWorkItem(input.visitWorkItemId);
  if (!workItem) throw new Error("Visita pre-creada no encontrada");
  if (!workItem.scheduledSessionId) {
    throw new Error("La visita no tiene una sesión agendada para cancelar");
  }
  if (workItem.comercialId !== input.comercialId) {
    throw new Error("No puedes cancelar una visita de otro comercial");
  }

  const session = await prisma.visitSchedulingSession.findUnique({
    where: { id: workItem.scheduledSessionId },
  });
  if (!session) {
    throw new Error("La sesión de visita agendada no existe");
  }

  await cancelVisitAtomically(session.id);
  const calendarCancelled = await cancelCalendarForSession({
    comercialId: input.comercialId,
    calendarEventId: session.calendarEventId,
  });
  const qstashMessageDeleted = await cancelParteVisitaSessionForVisit(session.id);

  await prisma.visitWorkItem.update({
    where: { id: workItem.id },
    data: {
      status: "CANCELLED",
      scheduledSessionId: null,
    },
  });

  const aggregate = buildVisitAggregate({
    demandId: workItem.demandId,
    draftDemandId: workItem.draftDemandId,
    fallback: session.id,
  });
  const event = await appendEvent({
    type: EventType.VISITA_CANCELADA,
    aggregateType: aggregate.aggregateType,
    aggregateId: aggregate.aggregateId,
    payload: {
      sessionId: session.id,
      demandId: workItem.demandId || null,
      propertyCode: workItem.propertyId || null,
      draftDemandId: workItem.draftDemandId,
      draftPropertyId: workItem.draftPropertyId,
      visitWorkItemId: workItem.id,
      cancelledBy: input.cancelledBy ?? "commercial",
      reason: input.reason ?? "",
      calendarEventId: session.calendarEventId || null,
      calendarCancelled,
      qstashMessageDeleted,
      source: "manual_visitas_ui",
    },
  });
  await enqueueJob({
    type: "PROCESS_EVENT",
    payload: { eventId: event.id },
    sourceEventId: event.id,
    idempotencyKey: `process_event:${event.id}`,
  });

  if (workItem.demandId) {
    await updateDemandLeadStatus(workItem.demandId, "EN_SELECCION");
  }

  return {
    eventId: event.id,
    visitSessionId: session.id,
    calendarCancelled,
    qstashMessageDeleted,
  };
}

export async function rescheduleManualVisit(
  input: ManualVisitRescheduleInput,
): Promise<ManualVisitRescheduleResult> {
  const workItem = await getVisitWorkItem(input.visitWorkItemId);
  if (!workItem) throw new Error("Visita pre-creada no encontrada");
  if (!workItem.scheduledSessionId) {
    throw new Error("La visita no tiene sesión previa para reprogramar");
  }
  if (workItem.comercialId !== input.comercialId) {
    throw new Error("No puedes reprogramar una visita de otro comercial");
  }

  const previousSession = await prisma.visitSchedulingSession.findUnique({
    where: { id: workItem.scheduledSessionId },
  });
  if (!previousSession) {
    throw new Error("La sesión previa de visita no existe");
  }

  await cancelVisitAtomically(previousSession.id);
  const calendarCancelled = await cancelCalendarForSession({
    comercialId: input.comercialId,
    calendarEventId: previousSession.calendarEventId,
  });
  const qstashMessageDeleted = await cancelParteVisitaSessionForVisit(previousSession.id);

  const aggregate = buildVisitAggregate({
    demandId: workItem.demandId,
    draftDemandId: workItem.draftDemandId,
    fallback: previousSession.id,
  });
  const reprogrammedEvent = await appendEvent({
    type: EventType.VISITA_REPROGRAMADA,
    aggregateType: aggregate.aggregateType,
    aggregateId: aggregate.aggregateId,
    payload: {
      sessionId: previousSession.id,
      demandId: workItem.demandId || null,
      propertyCode: workItem.propertyId || null,
      draftDemandId: workItem.draftDemandId,
      draftPropertyId: workItem.draftPropertyId,
      visitWorkItemId: workItem.id,
      reason: input.reason ?? input.notas ?? "",
      previousSlotStart: previousSession.confirmedSlotStart?.toISOString() ?? null,
      previousSlotEnd: previousSession.confirmedSlotEnd?.toISOString() ?? null,
      previousCalendarEventId: previousSession.calendarEventId || null,
      calendarCancelled,
      qstashMessageDeleted,
      source: "manual_visitas_ui",
    },
  });
  await enqueueJob({
    type: "PROCESS_EVENT",
    payload: { eventId: reprogrammedEvent.id },
    sourceEventId: reprogrammedEvent.id,
    idempotencyKey: `process_event:${reprogrammedEvent.id}`,
  });

  await prisma.visitWorkItem.update({
    where: { id: workItem.id },
    data: {
      status: "PENDING_SCHEDULE",
      scheduledSessionId: null,
    },
  });

  const scheduleResult = await scheduleManualVisit({
    visitWorkItemId: workItem.id,
    demandId: workItem.demandId || undefined,
    draftDemandId: workItem.draftDemandId || undefined,
    propertyId: workItem.propertyId || undefined,
    draftPropertyId: workItem.draftPropertyId || undefined,
    fecha: input.fecha,
    horaInicio: input.horaInicio,
    horaFin: input.horaFin,
    comercialId: input.comercialId,
    notas: input.notas,
  });

  return {
    reprogrammedEventId: reprogrammedEvent.id,
    previousSessionId: previousSession.id,
    newSessionId: scheduleResult.visitSessionId,
    scheduleEventId: scheduleResult.eventId,
    calendarCancelled,
    qstashMessageDeleted,
    calendar: scheduleResult.calendar,
  };
}
