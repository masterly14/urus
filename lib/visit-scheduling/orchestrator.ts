/**
 * Orquestador principal del flujo de agendamiento de visitas.
 *
 * Cada función corresponde a un paso concreto de la state machine y
 * conecta: Session Manager + Lock Manager + Slot Finder + Composio +
 * WhatsApp messages + Event Store + Job Queue.
 */

import { prisma } from "@/lib/prisma";
import { resolveComercialByProperty } from "@/lib/routing/resolve-comercial";
import { appendEvent } from "@/lib/event-store";
import { enqueueJob } from "@/lib/job-queue";
import type { JsonValue } from "@/lib/event-store/types";
import {
  createCalendarEventDirect,
  cancelCalendarEvent,
} from "@/lib/composio/calendar";
import {
  sendVisitProposalToCommercial,
  sendSlotProposalToBuyer,
  sendBuyerRejectionToCommercial,
  sendAskPreferenceToBuyer,
  sendBuyerPreferenceToCommercial,
  sendCollectDataRequest,
  sendVisitConfirmedToCommercial,
  sendVisitConfirmedToBuyer,
  sendEscalationToCommercial,
  sendEscalationToBuyer,
  sendVisitCancelledToBuyer,
} from "@/lib/whatsapp/visit-messages";

import { findAvailableSlots, findSpecificSlot } from "./slot-finder";
import { formatSlotLabel } from "./slot-finder";
import {
  createSlotLocks,
  releaseLocksForSession,
  releaseLocksExcept,
} from "./lock-manager";
import {
  createSession,
  transitionState,
  incrementRound,
  setVisitorData,
  getSessionById,
} from "./session-manager";
import { confirmVisitAtomically, cancelVisitAtomically } from "./confirm-visit";
import {
  SLOT_LOCK_TTL_MS,
  COMMERCIAL_RESPONSE_TTL_MS,
  BUYER_RESPONSE_TTL_MS,
  BUYER_PREFERENCE_TTL_MS,
} from "./constants";
import type { VisitContext, VisitorData } from "./types";
import { ComposioNotConnectedError } from "./types";
import { scheduleParteVisita } from "@/lib/parte-visita/schedule";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveComercialForProperty(propertyCode: string) {
  const property = await prisma.propertyCurrent.findUnique({
    where: { codigo: propertyCode },
  });
  if (!property) return null;

  const comercial = await resolveComercialByProperty(propertyCode);

  return comercial && property
    ? { property, comercial }
    : null;
}

// ---------------------------------------------------------------------------
// 1. initiateVisitScheduling
// ---------------------------------------------------------------------------

export async function initiateVisitScheduling(
  demandId: string,
  propertyCode: string,
  buyerWaId: string,
  correlationId?: string,
) {
  const resolved = await resolveComercialForProperty(propertyCode);
  if (!resolved) {
    console.error(
      `[orchestrator] No se encontró comercial para propiedad ${propertyCode}`,
    );
    return null;
  }

  const { property, comercial } = resolved;

  if (!comercial.composioConnectionId) {
    throw new ComposioNotConnectedError(comercial.id);
  }

  if (!comercial.waId) {
    console.error(
      `[orchestrator] Comercial ${comercial.id} no tiene waId configurado`,
    );
    return null;
  }

  const context: VisitContext = {
    demandId,
    propertyCode,
    buyerWaId,
    property: {
      ref: property.ref,
      titulo: property.titulo,
      direccion: `${property.zona}, ${property.ciudad}`,
      precio: property.precio,
      ciudad: property.ciudad,
      zona: property.zona,
      habitaciones: property.habitaciones,
      metrosConstruidos: property.metrosConstruidos,
    },
    comercial: {
      id: comercial.id,
      nombre: comercial.nombre,
      waId: comercial.waId,
      composioConnectionId: comercial.composioConnectionId,
    },
  };

  const session = await createSession(context);

  await appendEvent({
    type: "VISITA_SOLICITADA",
    aggregateType: "VISIT_SCHEDULING",
    aggregateId: session.id,
    payload: {
      sessionId: session.id,
      demandId,
      propertyCode,
      comercialId: comercial.id,
      buyerWaId,
    } as unknown as JsonValue,
    correlationId,
  });

  await fetchAndProposeSlots(session.id, correlationId);

  return session;
}

// ---------------------------------------------------------------------------
// 2. fetchAndProposeSlots
// ---------------------------------------------------------------------------

export async function fetchAndProposeSlots(
  sessionId: string,
  correlationId?: string,
  rejectedSlotLabel?: string,
) {
  const session = await getSessionById(sessionId);

  const comercial = await prisma.comercial.findUniqueOrThrow({
    where: { id: session.comercialId },
  });

  if (!comercial.composioConnectionId || !comercial.waId) {
    return handleEscalation(
      sessionId,
      "Comercial sin conexión de calendario o WhatsApp",
      correlationId,
    );
  }

  await transitionState(sessionId, "FETCHING_SLOTS");

  // En rondas > 0 excluimos el slot que el comprador acaba de rechazar
  // para que no vuelva a aparecer como opción al comercial.
  const excludeSlotStarts: Date[] = [];
  if (session.currentRound > 0 && session.confirmedSlotStart) {
    excludeSlotStarts.push(session.confirmedSlotStart);
  }

  // H30: si la API de free/busy falla, findAvailableSlots lanza un error
  // explícito (ya no hay fallback LLM no determinista). En ese caso escalamos
  // al comercial para que gestione manualmente la cita en vez de proponer
  // slots sobre disponibilidad desconocida.
  let result;
  try {
    result = await findAvailableSlots({
      comercialId: session.comercialId,
      composioConnectionId: comercial.composioConnectionId,
      propertyCode: session.propertyCode,
      excludeSessionId: sessionId,
      excludeSlotStarts: excludeSlotStarts.length ? excludeSlotStarts : undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[orchestrator] findAvailableSlots falló session=${sessionId}: ${msg}`,
    );
    return handleEscalation(
      sessionId,
      `No se pudo consultar la disponibilidad del calendario (${msg}). Gestiona la visita manualmente.`,
      correlationId,
    );
  }

  if (result.available.length === 0) {
    return handleEscalation(
      sessionId,
      `No se encontraron slots disponibles (${result.totalCandidates} candidatos evaluados)`,
      correlationId,
    );
  }

  const slots = result.available;

  await createSlotLocks(
    sessionId,
    session.comercialId,
    session.propertyCode,
    slots,
    SLOT_LOCK_TTL_MS,
  );

  const property = await prisma.propertyCurrent.findUnique({
    where: { codigo: session.propertyCode },
  });

  const slotsForMessage = slots.map((s, i) => ({
    id: `slot_${i}:${sessionId}`,
    label: s.label,
  }));

  await sendVisitProposalToCommercial(comercial.waId, {
    sessionId,
    propertyRef: property?.ref ?? session.propertyCode,
    propertyTitle: property?.titulo ?? session.propertyCode,
    propertyAddress: property
      ? `${property.zona}, ${property.ciudad}`
      : "",
    propertyPrice: property?.precio ?? 0,
    propertyCiudad: property?.ciudad ?? "",
    propertyZona: property?.zona ?? "",
    propertyHabitaciones: property?.habitaciones ?? 0,
    propertyMetros: property?.metrosConstruidos ?? 0,
    buyerWaId: session.buyerWaId,
    slots: slotsForMessage,
    round: session.currentRound + 1,
    rejectedSlotLabel,
  });

  await transitionState(sessionId, "SLOTS_PROPOSED_TO_COMMERCIAL", {
    lastProposedSlots: slots.map((s) => ({
      start: s.start.toISOString(),
      end: s.end.toISOString(),
      label: s.label,
    })),
  });

  await enqueueJob({
    type: "VISIT_CHECK_COMMERCIAL_TIMEOUT",
    payload: { sessionId },
    availableAt: new Date(Date.now() + COMMERCIAL_RESPONSE_TTL_MS),
    idempotencyKey: `visit_commercial_timeout:${sessionId}:r${session.currentRound}`,
    sourceEventId: undefined,
  });

  await appendEvent({
    type: "VISITA_SLOTS_PROPUESTOS",
    aggregateType: "VISIT_SCHEDULING",
    aggregateId: sessionId,
    payload: {
      sessionId,
      round: session.currentRound + 1,
      slots: slots.map((s) => ({
        start: s.start.toISOString(),
        end: s.end.toISOString(),
        label: s.label,
      })),
      comercialWaId: comercial.waId,
    } as unknown as JsonValue,
    correlationId,
  });
}

// ---------------------------------------------------------------------------
// 3. handleCommercialSlotSelection
// ---------------------------------------------------------------------------

export async function handleCommercialSlotSelection(
  sessionId: string,
  selectedSlotIndex: number,
  correlationId?: string,
) {
  const session = await getSessionById(sessionId);
  const proposedSlots = session.lastProposedSlots as
    | { start: string; end: string; label: string }[]
    | null;

  if (!proposedSlots || selectedSlotIndex >= proposedSlots.length) {
    console.error(
      `[orchestrator] Slot index ${selectedSlotIndex} fuera de rango para sesión ${sessionId}`,
    );
    return;
  }

  const selected = proposedSlots[selectedSlotIndex];
  const slotStart = new Date(selected.start);
  const slotEnd = new Date(selected.end);

  await releaseLocksExcept(sessionId, slotStart, slotEnd);

  await transitionState(sessionId, "COMMERCIAL_ACCEPTED_SLOT", {
    confirmedSlotStart: slotStart,
    confirmedSlotEnd: slotEnd,
  });

  await appendEvent({
    type: "VISITA_SLOT_SELECCIONADO",
    aggregateType: "VISIT_SCHEDULING",
    aggregateId: sessionId,
    payload: {
      sessionId,
      selectedSlotStart: selected.start,
      selectedSlotEnd: selected.end,
      selectedByComercialId: session.comercialId,
    } as unknown as JsonValue,
    correlationId,
  });

  const property = await prisma.propertyCurrent.findUnique({
    where: { codigo: session.propertyCode },
  });
  const comercial = await prisma.comercial.findUniqueOrThrow({
    where: { id: session.comercialId },
  });

  await sendSlotProposalToBuyer(session.buyerWaId, {
    sessionId,
    propertyTitle: property?.titulo ?? session.propertyCode,
    propertyAddress: property
      ? `${property.zona}, ${property.ciudad}`
      : "",
    slotLabel: selected.label,
    comercialName: comercial.nombre,
  });

  await transitionState(sessionId, "SLOT_PROPOSED_TO_BUYER");

  await enqueueJob({
    type: "VISIT_CHECK_BUYER_TIMEOUT",
    payload: { sessionId },
    availableAt: new Date(Date.now() + BUYER_RESPONSE_TTL_MS),
    idempotencyKey: `visit_buyer_timeout:${sessionId}:r${session.currentRound}`,
    sourceEventId: undefined,
  });

  await appendEvent({
    type: "VISITA_PROPUESTA_ENVIADA",
    aggregateType: "VISIT_SCHEDULING",
    aggregateId: sessionId,
    payload: {
      sessionId,
      slotStart: selected.start,
      slotEnd: selected.end,
      buyerWaId: session.buyerWaId,
    } as unknown as JsonValue,
    correlationId,
  });
}

// ---------------------------------------------------------------------------
// 4. handleBuyerAcceptance
// ---------------------------------------------------------------------------

export async function handleBuyerAcceptance(
  sessionId: string,
  correlationId?: string,
) {
  const session = await getSessionById(sessionId);

  await transitionState(sessionId, "BUYER_ACCEPTED");

  await appendEvent({
    type: "VISITA_COMPRADOR_ACEPTO",
    aggregateType: "VISIT_SCHEDULING",
    aggregateId: sessionId,
    payload: {
      sessionId,
      slotStart: session.confirmedSlotStart?.toISOString() ?? "",
      slotEnd: session.confirmedSlotEnd?.toISOString() ?? "",
    } as unknown as JsonValue,
    correlationId,
  });

  await transitionState(sessionId, "COLLECTING_VISITOR_DATA");

  const property = await prisma.propertyCurrent.findUnique({
    where: { codigo: session.propertyCode },
  });

  const slotLabel = session.confirmedSlotStart && session.confirmedSlotEnd
    ? formatSlotLabel({
        start: session.confirmedSlotStart,
        end: session.confirmedSlotEnd,
      })
    : "";

  await sendCollectDataRequest(session.buyerWaId, {
    propertyTitle: property?.titulo ?? session.propertyCode,
    slotLabel,
  });
}

// ---------------------------------------------------------------------------
// 5. handleBuyerRejection
// ---------------------------------------------------------------------------

export async function handleBuyerRejection(
  sessionId: string,
  correlationId?: string,
) {
  const session = await getSessionById(sessionId);

  await releaseLocksForSession(sessionId);

  await transitionState(sessionId, "BUYER_REJECTED");

  const slotLabel = session.confirmedSlotStart && session.confirmedSlotEnd
    ? formatSlotLabel({
        start: session.confirmedSlotStart,
        end: session.confirmedSlotEnd,
      })
    : "";

  await appendEvent({
    type: "VISITA_COMPRADOR_RECHAZO",
    aggregateType: "VISIT_SCHEDULING",
    aggregateId: sessionId,
    payload: {
      sessionId,
      round: session.currentRound,
      slotStart: session.confirmedSlotStart?.toISOString() ?? "",
      slotEnd: session.confirmedSlotEnd?.toISOString() ?? "",
    } as unknown as JsonValue,
    correlationId,
  });

  const { maxReached } = await incrementRound(sessionId);

  if (!maxReached) {
    const comercial = await prisma.comercial.findUniqueOrThrow({
      where: { id: session.comercialId },
    });

    await sendBuyerRejectionToCommercial(comercial.waId!, {
      comercialName: comercial.nombre,
      buyerWaId: session.buyerWaId,
      rejectedSlotLabel: slotLabel,
      propertyRef: session.propertyCode,
    });

    await fetchAndProposeSlots(sessionId, correlationId, slotLabel);
  } else {
    await transitionState(sessionId, "ASKING_BUYER_PREFERENCE");

    const property = await prisma.propertyCurrent.findUnique({
      where: { codigo: session.propertyCode },
    });
    const comercial = await prisma.comercial.findUniqueOrThrow({
      where: { id: session.comercialId },
    });

    await sendAskPreferenceToBuyer(session.buyerWaId, {
      propertyTitle: property?.titulo ?? session.propertyCode,
      propertyRef: property?.ref ?? session.propertyCode,
      comercialName: comercial.nombre,
    });

    await enqueueJob({
      type: "VISIT_CHECK_BUYER_TIMEOUT",
      payload: { sessionId },
      availableAt: new Date(Date.now() + BUYER_PREFERENCE_TTL_MS),
      idempotencyKey: `visit_buyer_pref_timeout:${sessionId}`,
      sourceEventId: undefined,
    });
  }
}

// ---------------------------------------------------------------------------
// 6. handleBuyerPreference
// ---------------------------------------------------------------------------

export async function handleBuyerPreference(
  sessionId: string,
  preferredDate: Date,
  correlationId?: string,
) {
  const session = await getSessionById(sessionId);
  const comercial = await prisma.comercial.findUniqueOrThrow({
    where: { id: session.comercialId },
  });

  if (!comercial.composioConnectionId || !comercial.waId) {
    return handleEscalation(
      sessionId,
      "Comercial sin conexión de calendario",
      correlationId,
    );
  }

  await transitionState(sessionId, "FETCHING_SPECIFIC_SLOT");

  // H30: findSpecificSlot ya no tiene fallback LLM. Si la API de Composio
  // falla propagamos el error y escalamos al comercial.
  let result;
  try {
    result = await findSpecificSlot({
      comercialId: session.comercialId,
      composioConnectionId: comercial.composioConnectionId,
      propertyCode: session.propertyCode,
      excludeSessionId: sessionId,
      preferredDate,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[orchestrator] findSpecificSlot falló session=${sessionId}: ${msg}`,
    );
    return handleEscalation(
      sessionId,
      `No se pudo verificar disponibilidad para el horario preferido del comprador (${msg}). Gestiona la visita manualmente.`,
      correlationId,
    );
  }

  if (result.available.length === 0) {
    await transitionState(sessionId, "ASKING_BUYER_PREFERENCE", {
      buyerPreferredDate: preferredDate.toISOString(),
    });

    await sendAskPreferenceToBuyer(session.buyerWaId, {
      propertyTitle: session.propertyCode,
      propertyRef: session.propertyCode,
      comercialName: comercial.nombre,
    });
    return;
  }

  const slot = result.available[0];

  await createSlotLocks(
    sessionId,
    session.comercialId,
    session.propertyCode,
    [slot],
    SLOT_LOCK_TTL_MS,
  );

  const property = await prisma.propertyCurrent.findUnique({
    where: { codigo: session.propertyCode },
  });

  await sendBuyerPreferenceToCommercial(comercial.waId, {
    sessionId,
    buyerWaId: session.buyerWaId,
    preferredDateLabel: slot.label,
    propertyRef: property?.ref ?? session.propertyCode,
    propertyTitle: property?.titulo ?? session.propertyCode,
  });

  await transitionState(sessionId, "SPECIFIC_SLOT_TO_COMMERCIAL", {
    confirmedSlotStart: slot.start,
    confirmedSlotEnd: slot.end,
    buyerPreferredDate: preferredDate.toISOString(),
  });

  await enqueueJob({
    type: "VISIT_CHECK_COMMERCIAL_TIMEOUT",
    payload: { sessionId },
    availableAt: new Date(Date.now() + COMMERCIAL_RESPONSE_TTL_MS),
    idempotencyKey: `visit_commercial_pref_timeout:${sessionId}`,
    sourceEventId: undefined,
  });
}

// ---------------------------------------------------------------------------
// 7. handleVisitorData
// ---------------------------------------------------------------------------

export async function handleVisitorData(
  sessionId: string,
  visitorData: VisitorData,
  correlationId?: string,
) {
  const session = await getSessionById(sessionId);

  await setVisitorData(sessionId, visitorData);

  const confirmResult = await confirmVisitAtomically({
    sessionId,
    slotStart: session.confirmedSlotStart!,
    slotEnd: session.confirmedSlotEnd!,
    propertyCode: session.propertyCode,
    comercialId: session.comercialId,
  });

  const comercial = await prisma.comercial.findUniqueOrThrow({
    where: { id: session.comercialId },
  });
  const property = await prisma.propertyCurrent.findUnique({
    where: { codigo: session.propertyCode },
  });

  const slotLabel = formatSlotLabel({
    start: session.confirmedSlotStart!,
    end: session.confirmedSlotEnd!,
  });

  let calendarEventId: string | undefined;
  let calendarLink: string | undefined;
  let calendarSuccess = false;

  if (comercial.composioConnectionId) {
    try {
      const calResult = await createCalendarEventDirect(
        comercial.composioConnectionId,
        {
          summary: `Visita: ${property?.titulo ?? session.propertyCode}`,
          description: [
            `Visita inmobiliaria — ${property?.titulo ?? session.propertyCode}`,
            `Visitante: ${visitorData.name}`,
            `Teléfono: ${visitorData.phone}`,
            visitorData.count ? `Asistentes: ${visitorData.count}` : "",
            `Dirección: ${property?.zona ?? ""}, ${property?.ciudad ?? ""}`,
          ]
            .filter(Boolean)
            .join("\n"),
          startDatetime: session.confirmedSlotStart!.toISOString().replace("Z", ""),
          endDatetime: session.confirmedSlotEnd!.toISOString().replace("Z", ""),
          location: property
            ? `${property.zona}, ${property.ciudad}`
            : undefined,
        },
      );
      calendarEventId = calResult.eventId;
      calendarLink = calResult.link;
      calendarSuccess = calResult.success;
    } catch (err) {
      console.error(
        `[orchestrator] Error creando evento de calendario para sesión ${sessionId}`,
        err,
      );
    }
  }

  if (calendarEventId) {
    await prisma.visitSchedulingSession.update({
      where: { id: sessionId },
      data: { calendarEventId, calendarLink },
    });
  }

  await appendEvent({
    type: "VISITA_DATOS_RECOPILADOS",
    aggregateType: "VISIT_SCHEDULING",
    aggregateId: sessionId,
    payload: {
      sessionId,
      visitorName: visitorData.name,
      visitorPhone: visitorData.phone,
      visitorCount: visitorData.count,
    } as unknown as JsonValue,
    correlationId,
  });

  const startDate = session.confirmedSlotStart!;
  const fecha = startDate.toISOString().split("T")[0];
  const horaInicio = startDate.toISOString().split("T")[1].substring(0, 5);
  const horaFin = session
    .confirmedSlotEnd!.toISOString()
    .split("T")[1]
    .substring(0, 5);

  await appendEvent({
    type: "VISITA_AGENDADA",
    aggregateType: "VISIT_SCHEDULING",
    aggregateId: sessionId,
    payload: {
      sessionId,
      comercialId: session.comercialId,
      comercialNombre: comercial.nombre,
      demandId: session.demandId,
      propertyCode: session.propertyCode,
      fecha,
      horaInicio,
      horaFin,
      visitorName: visitorData.name,
      visitorPhone: visitorData.phone,
      visitorCount: visitorData.count,
      calendarEventId,
      calendarLink,
      calendarSuccess,
    } as unknown as JsonValue,
    correlationId,
  });

  await sendVisitConfirmedToCommercial(comercial.waId!, {
    comercialName: comercial.nombre,
    propertyRef: property?.ref ?? session.propertyCode,
    propertyTitle: property?.titulo ?? session.propertyCode,
    slotLabel,
    visitorName: visitorData.name,
    visitorPhone: visitorData.phone,
    visitorCount: visitorData.count,
    calendarLink,
  });

  await sendVisitConfirmedToBuyer(session.buyerWaId, {
    propertyTitle: property?.titulo ?? session.propertyCode,
    propertyAddress: property
      ? `${property.zona}, ${property.ciudad}`
      : "",
    slotLabel,
    comercialName: comercial.nombre,
    comercialPhone: comercial.telefono || undefined,
  });

  // Schedule Parte de Visita document flow for the visit start time
  const updatedSession = await getSessionById(sessionId);
  try {
    await scheduleParteVisita(updatedSession);
  } catch (err) {
    console.error(
      `[orchestrator] Error scheduling parte de visita for session ${sessionId}:`,
      err instanceof Error ? err.message : err,
    );
  }

  return confirmResult;
}

// ---------------------------------------------------------------------------
// 8. handleCommercialConfirmsBuyerPreference
// ---------------------------------------------------------------------------

export async function handleCommercialConfirmsBuyerPreference(
  sessionId: string,
  correlationId?: string,
) {
  await transitionState(sessionId, "BUYER_ACCEPTED");
  await transitionState(sessionId, "COLLECTING_VISITOR_DATA");

  const session = await getSessionById(sessionId);
  const property = await prisma.propertyCurrent.findUnique({
    where: { codigo: session.propertyCode },
  });

  const slotLabel = session.confirmedSlotStart && session.confirmedSlotEnd
    ? formatSlotLabel({
        start: session.confirmedSlotStart,
        end: session.confirmedSlotEnd,
      })
    : "";

  await sendCollectDataRequest(session.buyerWaId, {
    propertyTitle: property?.titulo ?? session.propertyCode,
    slotLabel,
  });
}

// ---------------------------------------------------------------------------
// 9. handleCommercialRejectsBuyerPreference
// ---------------------------------------------------------------------------

export async function handleCommercialRejectsBuyerPreference(
  sessionId: string,
  correlationId?: string,
) {
  await handleEscalation(
    sessionId,
    "Comercial rechazó la fecha preferida del comprador",
    correlationId,
  );
}

// ---------------------------------------------------------------------------
// 10. handleEscalation
// ---------------------------------------------------------------------------

export async function handleEscalation(
  sessionId: string,
  reason: string,
  correlationId?: string,
) {
  const session = await getSessionById(sessionId);

  await releaseLocksForSession(sessionId);

  await transitionState(sessionId, "ESCALATED_MANUAL", {
    escalationReason: reason,
    completedAt: new Date(),
  });

  const comercial = await prisma.comercial.findUniqueOrThrow({
    where: { id: session.comercialId },
  });
  const property = await prisma.propertyCurrent.findUnique({
    where: { codigo: session.propertyCode },
  });

  const proposedSlots = (session.lastProposedSlots as
    | { start: string; end: string; label: string }[]
    | null) ?? [];

  if (comercial.waId) {
    await sendEscalationToCommercial(comercial.waId, {
      comercialName: comercial.nombre,
      buyerWaId: session.buyerWaId,
      propertyRef: property?.ref ?? session.propertyCode,
      propertyTitle: property?.titulo ?? session.propertyCode,
      roundsAttempted: session.currentRound,
      slotsAttempted: proposedSlots.map((s) => s.label),
      buyerPreferredDate: session.buyerPreferredDate ?? undefined,
      reason,
    });
  }

  await sendEscalationToBuyer(session.buyerWaId, {
    propertyTitle: property?.titulo ?? session.propertyCode,
    propertyRef: property?.ref ?? session.propertyCode,
    comercialName: comercial.nombre,
  });

  await appendEvent({
    type: "VISITA_ESCALADA_MANUAL",
    aggregateType: "VISIT_SCHEDULING",
    aggregateId: sessionId,
    payload: {
      sessionId,
      reason,
      roundsAttempted: session.currentRound,
      comercialId: session.comercialId,
      buyerWaId: session.buyerWaId,
      propertyCode: session.propertyCode,
      slotsAttempted: proposedSlots.map((s) => ({
        start: s.start,
        end: s.end,
      })),
      buyerPreferredDate: session.buyerPreferredDate,
    } as unknown as JsonValue,
    correlationId,
  });
}

// ---------------------------------------------------------------------------
// 11. handleCancellation
// ---------------------------------------------------------------------------

export async function handleCancellation(
  sessionId: string,
  cancelledBy: "buyer" | "commercial" | "system" = "buyer",
  correlationId?: string,
) {
  const session = await getSessionById(sessionId);

  const result = await cancelVisitAtomically(sessionId);

  if (session.calendarEventId) {
    const comercial = await prisma.comercial.findUniqueOrThrow({
      where: { id: session.comercialId },
    });
    if (comercial.composioConnectionId) {
      try {
        await cancelCalendarEvent(
          comercial.composioConnectionId,
          session.calendarEventId,
        );
      } catch (err) {
        console.error(
          `[orchestrator] Error cancelando evento de calendario ${session.calendarEventId}`,
          err,
        );
      }
    }
  }

  const property = await prisma.propertyCurrent.findUnique({
    where: { codigo: session.propertyCode },
  });

  const slotLabel = session.confirmedSlotStart && session.confirmedSlotEnd
    ? formatSlotLabel({
        start: session.confirmedSlotStart,
        end: session.confirmedSlotEnd,
      })
    : "";

  await sendVisitCancelledToBuyer(session.buyerWaId, {
    propertyTitle: property?.titulo ?? session.propertyCode,
    propertyRef: property?.ref ?? session.propertyCode,
    slotLabel,
  });

  await appendEvent({
    type: "VISITA_CANCELADA",
    aggregateType: "VISIT_SCHEDULING",
    aggregateId: sessionId,
    payload: {
      sessionId,
      cancelledBy,
      calendarEventId: session.calendarEventId,
    } as unknown as JsonValue,
    correlationId,
  });

  return result;
}

// ---------------------------------------------------------------------------
// 12. handleRescheduling
// ---------------------------------------------------------------------------

export async function handleRescheduling(
  sessionId: string,
  requestedBy: "buyer" | "commercial" = "buyer",
  correlationId?: string,
) {
  const session = await getSessionById(sessionId);

  if (session.calendarEventId) {
    const comercial = await prisma.comercial.findUniqueOrThrow({
      where: { id: session.comercialId },
    });
    if (comercial.composioConnectionId) {
      try {
        await cancelCalendarEvent(
          comercial.composioConnectionId,
          session.calendarEventId,
        );
      } catch (err) {
        console.error(
          `[orchestrator] Error cancelando evento para reprogramación ${session.calendarEventId}`,
          err,
        );
      }
    }
  }

  await appendEvent({
    type: "VISITA_REPROGRAMADA",
    aggregateType: "VISIT_SCHEDULING",
    aggregateId: sessionId,
    payload: {
      sessionId,
      requestedBy,
      originalSlotStart: session.confirmedSlotStart?.toISOString() ?? "",
      originalSlotEnd: session.confirmedSlotEnd?.toISOString() ?? "",
      calendarEventId: session.calendarEventId,
    } as unknown as JsonValue,
    correlationId,
  });

  await transitionState(sessionId, "VISIT_RESCHEDULED");
  await handleEscalation(
    sessionId,
    `Reprogramación solicitada por ${requestedBy}`,
    correlationId,
  );
}
