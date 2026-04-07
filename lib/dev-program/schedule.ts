/**
 * M12 — Programas de Desarrollo Continuo: lógica de scheduling.
 *
 * El cron diario (L-V ~8:30) llama a `scheduleDevExercises()`:
 * 1. Obtiene todos los comerciales activos con teléfono.
 * 2. Calcula weekNumber y tema de la semana.
 * 3. Encola un SEND_DEV_EXERCISE_NUDGE por comercial (DAILY + WEEKLY_CHALLENGE los lunes).
 * Idempotencia via `idempotencyKey`.
 */

import { prisma } from "@/lib/prisma";
import { enqueueJob } from "@/lib/job-queue";
import {
  getWeekNumber,
  getThemeForWeek,
  getIsoDayOfWeek,
  isWorkday,
  isMonday,
  getReferenceDate,
} from "./types";

export interface ScheduleResult {
  comercialesScanned: number;
  nudgesEnqueued: number;
  skipped: number;
}

interface ActiveComercial {
  id: string;
  nombre: string;
  telefono: string;
}

async function getActiveComerciales(): Promise<ActiveComercial[]> {
  return prisma.comercial.findMany({
    where: {
      activo: true,
      telefono: { not: "" },
    },
    select: {
      id: true,
      nombre: true,
      telefono: true,
    },
  });
}

function normalizePhoneToWaId(telefono: string): string {
  const digits = telefono.replace(/\D/g, "");
  if (digits.startsWith("34")) return digits;
  if (digits.length === 9) return `34${digits}`;
  return digits;
}

export async function scheduleDevExercises(
  now: Date = new Date(),
): Promise<ScheduleResult> {
  if (!isWorkday(now)) {
    return { comercialesScanned: 0, nudgesEnqueued: 0, skipped: 0 };
  }

  const referenceDate = getReferenceDate();
  const weekNumber = getWeekNumber(now, referenceDate);
  const dayOfWeek = getIsoDayOfWeek(now);
  const theme = getThemeForWeek(weekNumber);
  const monday = isMonday(now);

  const comerciales = await getActiveComerciales();
  let nudgesEnqueued = 0;
  let skipped = 0;

  for (const com of comerciales) {
    const waId = normalizePhoneToWaId(com.telefono);
    if (!waId) {
      skipped++;
      continue;
    }

    const dailyKey = `dev-exercise:${com.id}:w${weekNumber}:d${dayOfWeek}:DAILY`;

    await enqueueJob({
      type: "SEND_DEV_EXERCISE_NUDGE" as never,
      payload: {
        comercialId: com.id,
        waId,
        comercialName: com.nombre,
        theme: theme.id,
        themeLabel: theme.label,
        weekNumber,
        dayOfWeek,
        type: "DAILY",
      },
      idempotencyKey: dailyKey,
    });
    nudgesEnqueued++;

    if (monday) {
      const weeklyKey = `dev-exercise:${com.id}:w${weekNumber}:WEEKLY_CHALLENGE`;

      await enqueueJob({
        type: "SEND_DEV_EXERCISE_NUDGE" as never,
        payload: {
          comercialId: com.id,
          waId,
          comercialName: com.nombre,
          theme: theme.id,
          themeLabel: theme.label,
          weekNumber,
          dayOfWeek,
          type: "WEEKLY_CHALLENGE",
        },
        idempotencyKey: weeklyKey,
      });
      nudgesEnqueued++;
    }
  }

  console.log(
    `[dev-program] schedule: ${comerciales.length} comerciales, ${nudgesEnqueued} nudges encolados, ${skipped} sin teléfono. Semana ${weekNumber}, tema: ${theme.label}`,
  );

  return {
    comercialesScanned: comerciales.length,
    nudgesEnqueued,
    skipped,
  };
}
