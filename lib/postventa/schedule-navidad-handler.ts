/**
 * Job handler `SCHEDULE_POSTVENTA_NAVIDAD` (M9).
 *
 * Encola un `SEND_POSTVENTA_MESSAGE` con template `navidad` para la próxima
 * ocurrencia de Navidad (default 24-dic 12:00 Europe/Madrid) por operación.
 *
 * Solo agenda UNA vez. El reagendado anual indefinido se hace en
 * `send-message-handler.ts` tras completar el envío.
 */

import type { JobRecord } from "@/lib/job-queue/types";
import type { HandlerResult } from "@/lib/workers/consumer/types";
import { enqueueJob } from "@/lib/job-queue";
import {
  localYear,
  nextAnnualOccurrenceUtc,
  postventaNavidadDay,
  postventaNavidadHourLocal,
  postventaNavidadMonth,
  postventaTimezone,
} from "./anniversary-schedule";

interface Payload {
  sessionId: string;
  operacionId: string;
  propertyCode: string;
  buyerPhone: string;
}

function parsePayload(raw: unknown): Payload | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (
    typeof p.sessionId !== "string" ||
    typeof p.operacionId !== "string" ||
    typeof p.propertyCode !== "string" ||
    typeof p.buyerPhone !== "string"
  ) {
    return null;
  }
  return {
    sessionId: p.sessionId,
    operacionId: p.operacionId,
    propertyCode: p.propertyCode,
    buyerPhone: p.buyerPhone,
  };
}

export function computeNextNavidadUtc(now: Date = new Date()): Date {
  const tz = postventaTimezone();
  return nextAnnualOccurrenceUtc({
    monthIndex: postventaNavidadMonth() - 1,
    day: postventaNavidadDay(),
    hourLocal: postventaNavidadHourLocal(),
    timezone: tz,
    now,
  });
}

export async function handleSchedulePostventaNavidad(
  job: JobRecord,
): Promise<HandlerResult> {
  const payload = parsePayload(job.payload);
  if (!payload) {
    return {
      success: false,
      error: "SCHEDULE_POSTVENTA_NAVIDAD: payload incompleto",
      permanent: true,
    };
  }

  const next = computeNextNavidadUtc();
  const tz = postventaTimezone();
  const year = localYear(next, tz);
  const idempotencyKey = `postventa:navidad:${payload.operacionId}:${year}`;

  await enqueueJob({
    type: "SEND_POSTVENTA_MESSAGE",
    payload: {
      propertyCode: payload.propertyCode,
      operacionId: payload.operacionId,
      step: `NAVIDAD_${year}`,
      template: "navidad",
      closedAt: new Date().toISOString(),
      requiresNoIncidencia: false,
      sessionId: payload.sessionId,
      year,
    },
    availableAt: next,
    idempotencyKey,
    sourceEventId: job.sourceEventId ?? undefined,
  });

  console.log(
    `[postventa:schedule-navidad] operacionId=${payload.operacionId} encolado para ${next.toISOString()} (idk=${idempotencyKey})`,
  );
  return { success: true };
}
