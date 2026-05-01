import { AggregateType, EventType } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { fromZonedTime } from "date-fns-tz";
import { appendEvent } from "@/lib/event-store/event-store";
import { enqueueJob } from "@/lib/job-queue";
import { prisma } from "@/lib/prisma";
import { createCalendarEvent, type CalendarEventInput } from "@/lib/composio";
import { scheduleParteVisitaFromDetails } from "@/lib/parte-visita/schedule";
import { updateDemandLeadStatus } from "@/lib/projections/update-lead-status";
import {
  getVisitInterestPackageByDemand,
  type VisitInterestProperty,
} from "./interest-package";

export type ManualVisitScheduleInput = {
  demandId: string;
  propertyId: string;
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

function toDate(fecha: string, hora: string): Date {
  return fromZonedTime(`${fecha}T${hora}:00`, "Europe/Madrid");
}

function assertNoOverlap(input: {
  tx?: Prisma.TransactionClient;
  propertyCode: string;
  slotStart: Date;
  slotEnd: Date;
}) {
  const client = input.tx ?? prisma;
  return client.propertyVisitSlot.count({
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

function isVisitOverlapWriteError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const candidate = err as Error & { code?: string; meta?: Record<string, unknown> };
  const meta = JSON.stringify(candidate.meta ?? {});
  return (
    candidate.code === "P2002" ||
    candidate.code === "P2004" ||
    meta.includes("property_visit_slots_no_active_overlap") ||
    meta.includes("23P01")
  );
}

export async function scheduleManualVisit(
  input: ManualVisitScheduleInput,
): Promise<ManualVisitScheduleResult> {
  const pkg = await getVisitInterestPackageByDemand(input.demandId);
  if (!pkg) {
    throw new Error(`Demanda ${input.demandId} no encontrada`);
  }

  const property = pkg.properties.find((item) => item.propertyId === input.propertyId);
  if (!property) {
    throw new Error(`La propiedad ${input.propertyId} no consta como interés de la demanda ${input.demandId}`);
  }

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

  let visitSession;
  try {
    visitSession = await prisma.$transaction(async (tx) => {
      const overlapping = await assertNoOverlap({
        tx,
        propertyCode: input.propertyId,
        slotStart,
        slotEnd,
      });
      if (overlapping > 0) {
        throw new Error("La propiedad ya tiene una visita confirmada en ese horario");
      }

      const createdSession = await tx.visitSchedulingSession.create({
        data: {
          demandId: input.demandId,
          propertyCode: input.propertyId,
          comercialId: input.comercialId,
          buyerWaId: pkg.demand.buyerPhone,
          comercialWaId: comercial.waId || comercial.telefono || "",
          state: "VISIT_CONFIRMED",
          currentRound: 0,
          maxRounds: 0,
          confirmedSlotStart: slotStart,
          confirmedSlotEnd: slotEnd,
          visitorName: pkg.demand.demandName,
          visitorPhone: pkg.demand.buyerPhone,
          completedAt: new Date(),
        },
      });

      await tx.propertyVisitSlot.create({
        data: {
          propertyCode: input.propertyId,
          slotStart,
          slotEnd,
          sessionId: createdSession.id,
          comercialId: input.comercialId,
        },
      });

      return createdSession;
    });
  } catch (err) {
    if (isVisitOverlapWriteError(err)) {
      throw new Error("La propiedad ya tiene una visita confirmada en ese horario");
    }
    throw err;
  }

  let calendarResult;
  try {
    calendarResult = await createCalendarEvent(
      buildCalendarInput({
        demandName: pkg.demand.demandName || pkg.demand.demandId,
        property,
        fecha: input.fecha,
        horaInicio: input.horaInicio,
        horaFin: input.horaFin,
        notas: input.notas,
      }),
      comercial.composioConnectionId,
    );
  } catch (err) {
    await prisma.$transaction([
      prisma.propertyVisitSlot.deleteMany({ where: { sessionId: visitSession.id } }),
      prisma.visitSchedulingSession.delete({ where: { id: visitSession.id } }),
    ]);
    throw err;
  }

  await prisma.visitSchedulingSession.update({
    where: { id: visitSession.id },
    data: {
      calendarEventId: calendarResult.eventId ?? null,
      calendarLink: calendarResult.link ?? null,
    },
  });

  const event = await appendEvent({
    type: EventType.VISITA_AGENDADA,
    aggregateType: AggregateType.DEMAND,
    aggregateId: input.demandId,
    payload: {
      sessionId: visitSession.id,
      comercialId: input.comercialId,
      comercialNombre: comercial.nombre,
      demandId: input.demandId,
      propertyCode: input.propertyId,
      fecha: input.fecha,
      horaInicio: input.horaInicio,
      horaFin: input.horaFin,
      visitorName: pkg.demand.demandName,
      visitorPhone: pkg.demand.buyerPhone,
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

  await updateDemandLeadStatus(input.demandId, "VISITA_CONFIRMADA");
  await scheduleParteVisitaFromDetails({
    visitSessionId: visitSession.id,
    propertyCode: input.propertyId,
    propertyRef: property.reference,
    comercialId: input.comercialId,
    buyerPhone: pkg.demand.buyerPhone,
    visitDateTime: slotStart,
    direccion: property.address,
    tipoOperacion: "VENTA",
    precio: property.price ?? 0,
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
