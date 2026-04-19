import type { JobRecord } from "@/lib/job-queue/types";
import type { HandlerResult } from "./types";
import { prisma } from "@/lib/prisma";
import {
  fetchAndProposeSlots,
  handleBuyerRejection,
  handleEscalation,
  cleanupExpiredLocks,
  getSessionById,
  incrementRound,
} from "@/lib/visit-scheduling";
import {
  createCalendarEventDirect,
  cancelCalendarEvent,
  checkCalendarHealth,
} from "@/lib/composio/calendar";

// ---------------------------------------------------------------------------
// 1. VISIT_CHECK_COMMERCIAL_TIMEOUT
// ---------------------------------------------------------------------------

/**
 * Verifica si el comercial respondió dentro del TTL.
 * Si la sesión ya avanzó de estado (comercial respondió), es un no-op.
 * Cubre SLOTS_PROPOSED_TO_COMMERCIAL y SPECIFIC_SLOT_TO_COMMERCIAL.
 */
export async function handleVisitCheckCommercialTimeout(
  job: JobRecord,
): Promise<HandlerResult> {
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : "";

  if (!sessionId) {
    return { success: false, error: "VISIT_CHECK_COMMERCIAL_TIMEOUT sin sessionId", permanent: true };
  }

  const session = await getSessionById(sessionId);

  const COMMERCIAL_PENDING_STATES = new Set([
    "SLOTS_PROPOSED_TO_COMMERCIAL",
    "SPECIFIC_SLOT_TO_COMMERCIAL",
  ]);

  if (!COMMERCIAL_PENDING_STATES.has(session.state)) {
    console.log(
      `[visit-jobs] VISIT_CHECK_COMMERCIAL_TIMEOUT session ${sessionId} — state=${session.state}, already processed`,
    );
    return { success: true };
  }

  await prisma.visitSlotLock.updateMany({
    where: { sessionId, released: false },
    data: { released: true },
  });

  if (session.state === "SPECIFIC_SLOT_TO_COMMERCIAL") {
    console.log(
      `[visit-jobs] VISIT_CHECK_COMMERCIAL_TIMEOUT session ${sessionId} — commercial timeout on specific slot, escalating`,
    );
    await handleEscalation(sessionId, "Comercial no respondió a slot específico solicitado por comprador");
    return { success: true };
  }

  if (session.currentRound < session.maxRounds) {
    // H24: incrementamos currentRound ANTES de re-proponer para que el
    // idempotencyKey del siguiente VISIT_CHECK_COMMERCIAL_TIMEOUT (que usa
    // `:r${session.currentRound}` dentro de fetchAndProposeSlots) sea distinto
    // al del job que acabamos de consumir. Si no, el segundo enqueue colisiona
    // con la clave del job ya completado y se descarta silenciosamente.
    const { currentRound } = await incrementRound(sessionId);
    console.log(
      `[visit-jobs] VISIT_CHECK_COMMERCIAL_TIMEOUT session ${sessionId} — commercial timeout, re-fetching (round ${currentRound})`,
    );
    await fetchAndProposeSlots(sessionId);
  } else {
    console.log(
      `[visit-jobs] VISIT_CHECK_COMMERCIAL_TIMEOUT session ${sessionId} — max rounds reached, escalating`,
    );
    await handleEscalation(sessionId, "Comercial no respondió tras múltiples rondas");
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// 2. VISIT_CHECK_BUYER_TIMEOUT
// ---------------------------------------------------------------------------

/**
 * Verifica si el comprador respondió dentro del TTL.
 * Cubre SLOT_PROPOSED_TO_BUYER (trata como rechazo) y
 * ASKING_BUYER_PREFERENCE (escala al comercial).
 */
export async function handleVisitCheckBuyerTimeout(
  job: JobRecord,
): Promise<HandlerResult> {
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : "";

  if (!sessionId) {
    return { success: false, error: "VISIT_CHECK_BUYER_TIMEOUT sin sessionId", permanent: true };
  }

  const session = await getSessionById(sessionId);

  if (session.state === "ASKING_BUYER_PREFERENCE") {
    console.log(
      `[visit-jobs] VISIT_CHECK_BUYER_TIMEOUT session ${sessionId} — buyer preference timeout, escalating`,
    );
    await handleEscalation(sessionId, "Comprador no indicó preferencia de horario dentro del plazo");
    return { success: true };
  }

  if (session.state !== "SLOT_PROPOSED_TO_BUYER") {
    console.log(
      `[visit-jobs] VISIT_CHECK_BUYER_TIMEOUT session ${sessionId} — state=${session.state}, already processed`,
    );
    return { success: true };
  }

  console.log(
    `[visit-jobs] VISIT_CHECK_BUYER_TIMEOUT session ${sessionId} — buyer timeout, treating as rejection`,
  );
  await handleBuyerRejection(sessionId);

  return { success: true };
}

// ---------------------------------------------------------------------------
// 3. VISIT_CREATE_CALENDAR_EVENT
// ---------------------------------------------------------------------------

/**
 * Crea un evento en Google Calendar con reintentos.
 * Se usa como fallback cuando la creación inline en el orquestador falló.
 */
export async function handleVisitCreateCalendarEvent(
  job: JobRecord,
): Promise<HandlerResult> {
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : "";
  const composioConnectionId = typeof payload.composioConnectionId === "string" ? payload.composioConnectionId : "";

  if (!sessionId || !composioConnectionId) {
    return {
      success: false,
      error: "VISIT_CREATE_CALENDAR_EVENT sin sessionId o composioConnectionId",
      permanent: true,
    };
  }

  const session = await prisma.visitSchedulingSession.findUnique({
    where: { id: sessionId },
    select: {
      confirmedSlotStart: true,
      confirmedSlotEnd: true,
      visitorName: true,
      visitorPhone: true,
      visitorCount: true,
      propertyCode: true,
      calendarEventId: true,
    },
  });

  if (!session) {
    return { success: false, error: `Session ${sessionId} not found`, permanent: true };
  }

  if (session.calendarEventId) {
    console.log(
      `[visit-jobs] VISIT_CREATE_CALENDAR_EVENT session ${sessionId} — event already created: ${session.calendarEventId}`,
    );
    return { success: true };
  }

  if (!session.confirmedSlotStart || !session.confirmedSlotEnd) {
    return { success: false, error: "Session has no confirmed slot", permanent: true };
  }

  const property = await prisma.propertyCurrent.findUnique({
    where: { codigo: session.propertyCode },
    select: { titulo: true, zona: true, ciudad: true, ref: true },
  });

  try {
    const result = await createCalendarEventDirect(composioConnectionId, {
      summary: `Visita: ${property?.titulo ?? session.propertyCode}`,
      description: [
        `Visita inmobiliaria — ${property?.titulo ?? session.propertyCode}`,
        `Visitante: ${session.visitorName ?? "N/A"}`,
        `Teléfono: ${session.visitorPhone ?? "N/A"}`,
        session.visitorCount ? `Asistentes: ${session.visitorCount}` : "",
        `Dirección: ${property?.zona ?? ""}, ${property?.ciudad ?? ""}`,
      ]
        .filter(Boolean)
        .join("\n"),
      startDatetime: session.confirmedSlotStart.toISOString().replace("Z", ""),
      endDatetime: session.confirmedSlotEnd.toISOString().replace("Z", ""),
      location: property ? `${property.zona}, ${property.ciudad}` : undefined,
    });

    if (result.success && result.eventId) {
      await prisma.visitSchedulingSession.update({
        where: { id: sessionId },
        data: { calendarEventId: result.eventId, calendarLink: result.link },
      });
      console.log(
        `[visit-jobs] VISIT_CREATE_CALENDAR_EVENT session ${sessionId} — event created: ${result.eventId}`,
      );
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[visit-jobs] VISIT_CREATE_CALENDAR_EVENT session ${sessionId} — error: ${message}`,
    );
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// 4. VISIT_CANCEL_CALENDAR_EVENT
// ---------------------------------------------------------------------------

/**
 * Cancela un evento en Google Calendar.
 */
export async function handleVisitCancelCalendarEvent(
  job: JobRecord,
): Promise<HandlerResult> {
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const composioConnectionId = typeof payload.composioConnectionId === "string" ? payload.composioConnectionId : "";
  const calendarEventId = typeof payload.calendarEventId === "string" ? payload.calendarEventId : "";

  if (!composioConnectionId || !calendarEventId) {
    return {
      success: false,
      error: "VISIT_CANCEL_CALENDAR_EVENT sin composioConnectionId o calendarEventId",
      permanent: true,
    };
  }

  try {
    await cancelCalendarEvent(composioConnectionId, calendarEventId);
    console.log(
      `[visit-jobs] VISIT_CANCEL_CALENDAR_EVENT eventId=${calendarEventId} — cancelled`,
    );
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[visit-jobs] VISIT_CANCEL_CALENDAR_EVENT eventId=${calendarEventId} — error: ${message}`,
    );
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// 5. VISIT_CLEANUP_EXPIRED_LOCKS
// ---------------------------------------------------------------------------

/**
 * Limpia soft-locks expirados como red de seguridad.
 * Se ejecuta periódicamente via cron (cada 15 min).
 */
export async function handleVisitCleanupExpiredLocks(
  _job: JobRecord,
): Promise<HandlerResult> {
  const count = await cleanupExpiredLocks();
  if (count > 0) {
    console.log(
      `[visit-jobs] VISIT_CLEANUP_EXPIRED_LOCKS — cleaned ${count} expired locks`,
    );
  }
  return { success: true };
}

// ---------------------------------------------------------------------------
// 6. VISIT_CHECK_COMPOSIO_HEALTH
// ---------------------------------------------------------------------------

/**
 * Verifica la salud de las conexiones de Composio de todos los comerciales.
 * Si una conexión falla, marca composioConnectedAt = null para forzar reconexión.
 */
export async function handleVisitCheckComposioHealth(
  _job: JobRecord,
): Promise<HandlerResult> {
  const comerciales = await prisma.comercial.findMany({
    where: {
      activo: true,
      composioConnectionId: { not: null },
    },
    select: {
      id: true,
      nombre: true,
      composioConnectionId: true,
      waId: true,
    },
  });

  let checked = 0;
  let failed = 0;

  for (const comercial of comerciales) {
    if (!comercial.composioConnectionId) continue;

    checked++;
    try {
      const result = await checkCalendarHealth(comercial.composioConnectionId);
      if (!result.healthy) {
        failed++;
        console.warn(
          `[visit-jobs] VISIT_CHECK_COMPOSIO_HEALTH comercial=${comercial.nombre} (${comercial.id}) — unhealthy: ${result.error ?? "unknown"}`,
        );
        await prisma.comercial.update({
          where: { id: comercial.id },
          data: { composioConnectedAt: null },
        });
      }
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[visit-jobs] VISIT_CHECK_COMPOSIO_HEALTH comercial=${comercial.nombre} (${comercial.id}) — error: ${message}`,
      );
      await prisma.comercial.update({
        where: { id: comercial.id },
        data: { composioConnectedAt: null },
      });
    }
  }

  console.log(
    `[visit-jobs] VISIT_CHECK_COMPOSIO_HEALTH — checked=${checked} failed=${failed}`,
  );

  return { success: true };
}
