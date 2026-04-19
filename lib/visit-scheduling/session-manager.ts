import type { VisitSessionState, Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  VALID_TRANSITIONS,
  TERMINAL_STATES,
  MAX_ACTIVE_SESSIONS_PER_BUYER,
  COMMERCIAL_RESPONSE_TTL_MS,
  BUYER_RESPONSE_TTL_MS,
  BUYER_PREFERENCE_TTL_MS,
  BUYER_AWAITING_STATES,
  COMMERCIAL_AWAITING_STATES,
} from "./constants";
import {
  InvalidStateTransitionError,
  MaxActiveSessionsError,
} from "./types";
import type { VisitContext, VisitorData } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deadlineForState(state: VisitSessionState): Date | null {
  const now = Date.now();

  if ((COMMERCIAL_AWAITING_STATES as readonly string[]).includes(state)) {
    return new Date(now + COMMERCIAL_RESPONSE_TTL_MS);
  }
  if (state === "ASKING_BUYER_PREFERENCE") {
    return new Date(now + BUYER_PREFERENCE_TTL_MS);
  }
  if ((BUYER_AWAITING_STATES as readonly string[]).includes(state)) {
    return new Date(now + BUYER_RESPONSE_TTL_MS);
  }
  return null;
}

function isTerminal(state: VisitSessionState): boolean {
  return (TERMINAL_STATES as readonly string[]).includes(state);
}

// ---------------------------------------------------------------------------
// 1. createSession
// ---------------------------------------------------------------------------

/**
 * Crea una nueva sesión de agendamiento en estado `INITIATED`.
 * Lanza {@link MaxActiveSessionsError} si el comprador excede el límite.
 */
export async function createSession(input: VisitContext) {
  const activeCount = await prisma.visitSchedulingSession.count({
    where: {
      buyerWaId: input.buyerWaId,
      state: { notIn: TERMINAL_STATES as VisitSessionState[] },
    },
  });

  if (activeCount >= MAX_ACTIVE_SESSIONS_PER_BUYER) {
    throw new MaxActiveSessionsError(
      input.buyerWaId,
      MAX_ACTIVE_SESSIONS_PER_BUYER,
    );
  }

  return prisma.visitSchedulingSession.create({
    data: {
      demandId: input.demandId,
      propertyCode: input.propertyCode,
      comercialId: input.comercial.id,
      buyerWaId: input.buyerWaId,
      comercialWaId: input.comercial.waId,
      state: "INITIATED",
      currentRound: 0,
      maxRounds: 3,
    },
  });
}

// ---------------------------------------------------------------------------
// 2. getActiveSessionForBuyer
// ---------------------------------------------------------------------------

/**
 * Busca la sesión activa (no terminal) de un comprador.
 * Si se pasa `propertyCode`, filtra también por propiedad.
 */
export async function getActiveSessionForBuyer(
  buyerWaId: string,
  propertyCode?: string,
) {
  return prisma.visitSchedulingSession.findFirst({
    where: {
      buyerWaId,
      state: { notIn: TERMINAL_STATES as VisitSessionState[] },
      ...(propertyCode ? { propertyCode } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

// ---------------------------------------------------------------------------
// 3. getActiveSessionForComercial
// ---------------------------------------------------------------------------

/**
 * Busca la sesión activa que espera respuesta del comercial.
 * Usa los estados de `COMMERCIAL_AWAITING_STATES`.
 */
export async function getActiveSessionForComercial(comercialWaId: string) {
  return prisma.visitSchedulingSession.findFirst({
    where: {
      comercialWaId,
      state: { in: COMMERCIAL_AWAITING_STATES as VisitSessionState[] },
    },
    orderBy: { updatedAt: "desc" },
  });
}

// ---------------------------------------------------------------------------
// 4. transitionState
// ---------------------------------------------------------------------------

export type TransitionData = Partial<
  Pick<
    Prisma.VisitSchedulingSessionUncheckedUpdateInput,
    | "currentRound"
    | "confirmedSlotStart"
    | "confirmedSlotEnd"
    | "lastProposedSlots"
    | "lastCommercialMsgId"
    | "lastBuyerMsgId"
    | "buyerPreferredDate"
    | "escalationReason"
    | "visitorName"
    | "visitorPhone"
    | "visitorCount"
    | "calendarEventId"
    | "calendarLink"
    | "completedAt"
  >
>;

/**
 * Transiciona la sesión a un nuevo estado, validando que la transición
 * sea legal según {@link VALID_TRANSITIONS}. Calcula automáticamente
 * el deadline del paso según el nuevo estado.
 *
 * Lanza {@link InvalidStateTransitionError} si la transición no es válida.
 */
export async function transitionState(
  sessionId: string,
  newState: VisitSessionState,
  data?: TransitionData,
) {
  const session = await prisma.visitSchedulingSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: { state: true },
  });

  const allowed = VALID_TRANSITIONS[session.state];
  if (!allowed.includes(newState)) {
    throw new InvalidStateTransitionError(sessionId, session.state, newState);
  }

  const deadline = deadlineForState(newState);

  return prisma.visitSchedulingSession.update({
    where: { id: sessionId },
    data: {
      state: newState,
      currentStepDeadline: deadline,
      ...(data ?? {}),
    },
  });
}

// ---------------------------------------------------------------------------
// 5. incrementRound
// ---------------------------------------------------------------------------

/**
 * Incrementa el contador de rondas y devuelve si se alcanzó el máximo.
 */
export async function incrementRound(
  sessionId: string,
): Promise<{ currentRound: number; maxReached: boolean }> {
  const session = await prisma.visitSchedulingSession.update({
    where: { id: sessionId },
    data: { currentRound: { increment: 1 } },
    select: { currentRound: true, maxRounds: true },
  });

  return {
    currentRound: session.currentRound,
    maxReached: session.currentRound >= session.maxRounds,
  };
}

// ---------------------------------------------------------------------------
// 6. setVisitorData
// ---------------------------------------------------------------------------

/**
 * Persiste los datos del visitante recolectados al final del flujo.
 */
export async function setVisitorData(
  sessionId: string,
  visitor: VisitorData,
) {
  return prisma.visitSchedulingSession.update({
    where: { id: sessionId },
    data: {
      visitorName: visitor.name,
      visitorPhone: visitor.phone,
      visitorCount: visitor.count ?? null,
    },
  });
}

// ---------------------------------------------------------------------------
// 7. markCompleted
// ---------------------------------------------------------------------------

/**
 * Transita la sesión a `VISIT_CONFIRMED`, guarda datos de calendario
 * y marca `completedAt`.
 */
export async function markCompleted(
  sessionId: string,
  calendarEventId?: string,
  calendarLink?: string,
) {
  return transitionState(sessionId, "VISIT_CONFIRMED", {
    calendarEventId: calendarEventId ?? null,
    calendarLink: calendarLink ?? null,
    completedAt: new Date(),
  });
}

// ---------------------------------------------------------------------------
// 8. markEscalated
// ---------------------------------------------------------------------------

/**
 * Transita la sesión a `ESCALATED_MANUAL` con el motivo del escalado.
 */
export async function markEscalated(sessionId: string, reason: string) {
  return transitionState(sessionId, "ESCALATED_MANUAL", {
    escalationReason: reason,
    completedAt: new Date(),
  });
}

// ---------------------------------------------------------------------------
// 8b. completeVisit
// ---------------------------------------------------------------------------

/**
 * Transita la sesión de `VISIT_CONFIRMED` a `VISIT_COMPLETED`.
 * Se invoca cuando la visita ha tenido lugar (p. ej. tras recibir el
 * formulario del parte de visita).
 */
export async function completeVisit(sessionId: string) {
  return transitionState(sessionId, "VISIT_COMPLETED", {
    completedAt: new Date(),
  });
}

// ---------------------------------------------------------------------------
// 9. getSessionById
// ---------------------------------------------------------------------------

/**
 * Obtiene una sesión por ID. Lanza si no existe.
 */
export async function getSessionById(sessionId: string) {
  return prisma.visitSchedulingSession.findUniqueOrThrow({
    where: { id: sessionId },
  });
}

// ---------------------------------------------------------------------------
// 10. getSessionsAwaitingResponse
// ---------------------------------------------------------------------------

/**
 * Devuelve sesiones cuyo deadline ha expirado y siguen en un estado
 * que espera respuesta (comprador o comercial). Útil para el job de timeouts.
 */
export async function getExpiredSessions() {
  return prisma.visitSchedulingSession.findMany({
    where: {
      state: {
        in: [
          ...BUYER_AWAITING_STATES,
          ...COMMERCIAL_AWAITING_STATES,
        ] as VisitSessionState[],
      },
      currentStepDeadline: { lt: new Date() },
    },
    orderBy: { currentStepDeadline: "asc" },
  });
}

// ---------------------------------------------------------------------------
// 11. getAllActiveSessionsForBuyer
// ---------------------------------------------------------------------------

/**
 * Devuelve todas las sesiones activas de un comprador (para validar límites
 * o mostrar estado al comprador).
 */
export async function getAllActiveSessionsForBuyer(buyerWaId: string) {
  return prisma.visitSchedulingSession.findMany({
    where: {
      buyerWaId,
      state: { notIn: TERMINAL_STATES as VisitSessionState[] },
    },
    orderBy: { createdAt: "desc" },
  });
}
