/**
 * Red de seguridad para mensajes anuales (cumple / navidad) (M9).
 *
 * Recorre las `PostventaSurveySession` completadas y para cada operación
 * se asegura de que EXISTA al menos un job encolado (pending o completado)
 * para:
 *   - el próximo cumpleaños del comprador (si birthDate conocida)
 *   - la próxima Navidad
 *
 * Si faltan, los encola con la misma convención de idempotencyKey que
 * `schedule-birthday-handler` y `schedule-navidad-handler` (por año natural
 * en Europe/Madrid), lo que hace el reagendado idempotente.
 *
 * Diseñado para ejecutarse una vez al mes vía `/api/cron/postventa-rearm`.
 */

import { prisma } from "@/lib/prisma";
import { enqueueJob } from "@/lib/job-queue";
import {
  localDateTimeToUtc,
  localYear,
  nextAnnualOccurrenceUtc,
  postventaBirthdayHourLocal,
  postventaNavidadDay,
  postventaNavidadHourLocal,
  postventaNavidadMonth,
  postventaTimezone,
} from "./anniversary-schedule";

export interface PostventaRearmResult {
  sessionsScanned: number;
  birthdayEnqueued: number;
  navidadEnqueued: number;
  alreadyCovered: number;
}

const MAX_SESSIONS_PER_SCAN = 500;

async function jobExists(idempotencyKey: string): Promise<boolean> {
  const row = await prisma.jobQueue.findUnique({
    where: { idempotencyKey },
    select: { id: true },
  });
  return Boolean(row);
}

export async function rearmPostventaAnnualJobs(): Promise<PostventaRearmResult> {
  const sessions = await prisma.postventaSurveySession.findMany({
    where: { status: "COMPLETED", unsubscribedAt: null },
    select: {
      id: true,
      operacionId: true,
      propertyCode: true,
      buyerPhone: true,
      birthDate: true,
    },
    orderBy: { updatedAt: "desc" },
    take: MAX_SESSIONS_PER_SCAN,
  });

  const tz = postventaTimezone();
  const now = new Date();
  let birthdayEnqueued = 0;
  let navidadEnqueued = 0;
  let alreadyCovered = 0;

  for (const session of sessions) {
    let birthdayOk = true;
    let navidadOk = true;

    // Birthday
    if (session.birthDate) {
      const birth = session.birthDate;
      const yearNow = localYear(now, tz);
      const thisYearDate = localDateTimeToUtc(
        yearNow,
        birth.getUTCMonth(),
        birth.getUTCDate(),
        postventaBirthdayHourLocal(),
        tz,
      );
      const targetDate =
        thisYearDate.getTime() > now.getTime()
          ? thisYearDate
          : localDateTimeToUtc(
              yearNow + 1,
              birth.getUTCMonth(),
              birth.getUTCDate(),
              postventaBirthdayHourLocal(),
              tz,
            );
      const targetYear = localYear(targetDate, tz);
      const idempotencyKey = `postventa:cumple:${session.operacionId}:${targetYear}`;

      if (!(await jobExists(idempotencyKey))) {
        await enqueueJob({
          type: "SEND_POSTVENTA_MESSAGE",
          payload: {
            propertyCode: session.propertyCode,
            operacionId: session.operacionId,
            step: `BIRTHDAY_${targetYear}`,
            template: "cumple",
            closedAt: now.toISOString(),
            requiresNoIncidencia: false,
            sessionId: session.id,
            year: targetYear,
            birthDate: birth.toISOString(),
          },
          availableAt: targetDate,
          idempotencyKey,
        });
        birthdayEnqueued++;
        birthdayOk = false;
      }
    }

    // Navidad
    const navidadDate = nextAnnualOccurrenceUtc({
      monthIndex: postventaNavidadMonth() - 1,
      day: postventaNavidadDay(),
      hourLocal: postventaNavidadHourLocal(),
      timezone: tz,
      now,
    });
    const navYear = localYear(navidadDate, tz);
    const navIdempotencyKey = `postventa:navidad:${session.operacionId}:${navYear}`;
    if (!(await jobExists(navIdempotencyKey))) {
      await enqueueJob({
        type: "SEND_POSTVENTA_MESSAGE",
        payload: {
          propertyCode: session.propertyCode,
          operacionId: session.operacionId,
          step: `NAVIDAD_${navYear}`,
          template: "navidad",
          closedAt: now.toISOString(),
          requiresNoIncidencia: false,
          sessionId: session.id,
          year: navYear,
        },
        availableAt: navidadDate,
        idempotencyKey: navIdempotencyKey,
      });
      navidadEnqueued++;
      navidadOk = false;
    }

    if (birthdayOk && navidadOk) alreadyCovered++;
  }

  return {
    sessionsScanned: sessions.length,
    birthdayEnqueued,
    navidadEnqueued,
    alreadyCovered,
  };
}
