import { prisma } from "@/lib/prisma";
import { MAX_CONCURRENT_VISITS_PER_PROPERTY, VALID_TRANSITIONS } from "./constants";
import type { VisitSessionState } from "@prisma/client";
import {
  SlotNoLongerAvailableError,
  PropertyFullError,
  InvalidStateTransitionError,
} from "./types";

// ---------------------------------------------------------------------------
// confirmVisitAtomically
// ---------------------------------------------------------------------------

export interface ConfirmVisitInput {
  sessionId: string;
  slotStart: Date;
  slotEnd: Date;
  propertyCode: string;
  comercialId: string;
}

export interface ConfirmVisitResult {
  success: true;
  propertyVisitSlotId: string;
}

/**
 * Transacción atómica que:
 * 1. Verifica que exista un lock vigente para la sesión + slot.
 * 2. Verifica capacidad de la propiedad (visitas concurrentes).
 * 3. Crea `PropertyVisitSlot` (reserva definitiva).
 * 4. Actualiza `VisitSchedulingSession` → `VISIT_CONFIRMED`.
 * 5. Libera todos los locks de la sesión.
 *
 * Lanza {@link SlotNoLongerAvailableError} o {@link PropertyFullError}
 * si alguna condición falla.
 */
export async function confirmVisitAtomically(
  input: ConfirmVisitInput,
): Promise<ConfirmVisitResult> {
  return prisma.$transaction(async (tx) => {
    // 0. Validar transición según state machine
    const session = await tx.visitSchedulingSession.findUniqueOrThrow({
      where: { id: input.sessionId },
      select: { state: true },
    });
    const allowed = VALID_TRANSITIONS[session.state as VisitSessionState];
    if (!allowed.includes("VISIT_CONFIRMED")) {
      throw new InvalidStateTransitionError(
        input.sessionId,
        session.state as VisitSessionState,
        "VISIT_CONFIRMED",
      );
    }

    // 1. Verificar lock vigente
    const lock = await tx.visitSlotLock.findFirst({
      where: {
        sessionId: input.sessionId,
        slotStart: input.slotStart,
        slotEnd: input.slotEnd,
        released: false,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });

    if (!lock) {
      throw new SlotNoLongerAvailableError(input.sessionId, input.slotStart);
    }

    // 2. Verificar capacidad de la propiedad
    const overlapping = await tx.propertyVisitSlot.count({
      where: {
        propertyCode: input.propertyCode,
        cancelled: false,
        slotStart: { lt: input.slotEnd },
        slotEnd: { gt: input.slotStart },
      },
    });

    if (overlapping >= MAX_CONCURRENT_VISITS_PER_PROPERTY) {
      throw new PropertyFullError(input.propertyCode, input.slotStart);
    }

    // 3. Crear PropertyVisitSlot (reserva definitiva)
    const pvs = await tx.propertyVisitSlot.create({
      data: {
        propertyCode: input.propertyCode,
        slotStart: input.slotStart,
        slotEnd: input.slotEnd,
        sessionId: input.sessionId,
        comercialId: input.comercialId,
      },
    });

    // 4. Actualizar sesión → VISIT_CONFIRMED
    await tx.visitSchedulingSession.update({
      where: { id: input.sessionId },
      data: {
        state: "VISIT_CONFIRMED",
        confirmedSlotStart: input.slotStart,
        confirmedSlotEnd: input.slotEnd,
        currentStepDeadline: null,
        completedAt: new Date(),
      },
    });

    // 5. Eliminar todos los locks de la sesión
    await tx.visitSlotLock.deleteMany({
      where: { sessionId: input.sessionId, released: false },
    });

    return { success: true as const, propertyVisitSlotId: pvs.id };
  });
}

// ---------------------------------------------------------------------------
// cancelVisitAtomically
// ---------------------------------------------------------------------------

export interface CancelVisitResult {
  success: true;
  cancelledSlots: number;
  releasedLocks: number;
}

/**
 * Transacción atómica que:
 * 1. Marca `VisitSchedulingSession.state = VISIT_CANCELLED`.
 * 2. Marca `PropertyVisitSlot.cancelled = true` para la sesión.
 * 3. Libera todos los locks residuales de la sesión.
 */
export async function cancelVisitAtomically(
  sessionId: string,
): Promise<CancelVisitResult> {
  return prisma.$transaction(async (tx) => {
    // 0. Validar transición según state machine
    const session = await tx.visitSchedulingSession.findUniqueOrThrow({
      where: { id: sessionId },
      select: { state: true },
    });
    const allowed = VALID_TRANSITIONS[session.state as VisitSessionState];
    if (!allowed.includes("VISIT_CANCELLED")) {
      throw new InvalidStateTransitionError(
        sessionId,
        session.state as VisitSessionState,
        "VISIT_CANCELLED",
      );
    }

    // 1. Actualizar sesión → VISIT_CANCELLED
    await tx.visitSchedulingSession.update({
      where: { id: sessionId },
      data: {
        state: "VISIT_CANCELLED",
        currentStepDeadline: null,
        completedAt: new Date(),
      },
    });

    // 2. Cancelar PropertyVisitSlots asociados
    const cancelled = await tx.propertyVisitSlot.updateMany({
      where: { sessionId, cancelled: false },
      data: { cancelled: true },
    });

    // 3. Eliminar locks residuales
    const locks = await tx.visitSlotLock.deleteMany({
      where: { sessionId, released: false },
    });

    return {
      success: true as const,
      cancelledSlots: cancelled.count,
      releasedLocks: locks.count,
    };
  });
}
