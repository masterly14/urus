/**
 * Job handler `SCHEDULE_POSTVENTA_BIRTHDAY` (M9).
 *
 * Encola un `SEND_POSTVENTA_MESSAGE` con template `cumple` para la próxima
 * ocurrencia del cumpleaños del comprador a las `POSTVENTA_BIRTHDAY_HOUR_LOCAL`
 * (default 12:00) en `POSTVENTA_TIMEZONE` (default Europe/Madrid).
 *
 * Este handler solo agenda UNA vez. El reagendado anual indefinido se hace
 * en `send-message-handler.ts` cuando el job `SEND_POSTVENTA_MESSAGE` de
 * template `cumple` completa con éxito.
 */

import type { JobRecord } from "@/lib/job-queue/types";
import type { HandlerResult } from "@/lib/workers/consumer/types";
import { enqueueJob } from "@/lib/job-queue";
import {
  localDateTimeToUtc,
  localYear,
  postventaBirthdayHourLocal,
  postventaTimezone,
} from "./anniversary-schedule";

interface Payload {
  sessionId: string;
  operacionId: string;
  propertyCode: string;
  buyerPhone: string;
  /** ISO string con la fecha de nacimiento (normalizada a UTC date). */
  birthDate: string;
}

function parsePayload(raw: unknown): Payload | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (
    typeof p.sessionId !== "string" ||
    typeof p.operacionId !== "string" ||
    typeof p.propertyCode !== "string" ||
    typeof p.buyerPhone !== "string" ||
    typeof p.birthDate !== "string"
  ) {
    return null;
  }
  return {
    sessionId: p.sessionId,
    operacionId: p.operacionId,
    propertyCode: p.propertyCode,
    buyerPhone: p.buyerPhone,
    birthDate: p.birthDate,
  };
}

export function computeNextBirthdayUtc(
  birthDateIso: string,
  now: Date = new Date(),
): Date | null {
  const birth = new Date(birthDateIso);
  if (Number.isNaN(birth.getTime())) return null;
  const tz = postventaTimezone();
  const hour = postventaBirthdayHourLocal();
  const monthIndex = birth.getUTCMonth();
  const day = birth.getUTCDate();

  const currentYear = localYear(now, tz);

  const thisYear = localDateTimeToUtc(currentYear, monthIndex, day, hour, tz);
  if (thisYear.getTime() > now.getTime()) return thisYear;
  return localDateTimeToUtc(currentYear + 1, monthIndex, day, hour, tz);
}

export async function handleSchedulePostventaBirthday(
  job: JobRecord,
): Promise<HandlerResult> {
  const payload = parsePayload(job.payload);
  if (!payload) {
    return {
      success: false,
      error: "SCHEDULE_POSTVENTA_BIRTHDAY: payload incompleto",
      permanent: true,
    };
  }

  const next = computeNextBirthdayUtc(payload.birthDate);
  if (!next) {
    return {
      success: false,
      error: "SCHEDULE_POSTVENTA_BIRTHDAY: birthDate inválida",
      permanent: true,
    };
  }

  const tz = postventaTimezone();
  const year = localYear(next, tz);
  const idempotencyKey = `postventa:cumple:${payload.operacionId}:${year}`;

  await enqueueJob({
    type: "SEND_POSTVENTA_MESSAGE",
    payload: {
      propertyCode: payload.propertyCode,
      operacionId: payload.operacionId,
      step: `BIRTHDAY_${year}`,
      template: "cumple",
      closedAt: new Date().toISOString(),
      requiresNoIncidencia: false,
      sessionId: payload.sessionId,
      year,
      birthDate: payload.birthDate,
    },
    availableAt: next,
    idempotencyKey,
    sourceEventId: job.sourceEventId ?? undefined,
  });

  console.log(
    `[postventa:schedule-birthday] operacionId=${payload.operacionId} encolado para ${next.toISOString()} (idk=${idempotencyKey})`,
  );
  return { success: true };
}
