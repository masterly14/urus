/**
 * M12 — Programas de Desarrollo Continuo: handler para SEND_DEV_EXERCISE_NUDGE.
 *
 * Crea el registro DevProgramExercise y envía el template Meta "nudge"
 * que invita al comercial a escribir `/coach ejercicio`.
 */

import type { JobRecord } from "@/lib/job-queue/types";
import type { HandlerResult } from "@/lib/workers/consumer/types";
import { prisma } from "@/lib/prisma";
import { sendDevExerciseNudge } from "@/lib/whatsapp/send";

interface NudgePayload {
  comercialId: string;
  waId: string;
  comercialName: string;
  theme: string;
  themeLabel: string;
  weekNumber: number;
  dayOfWeek: number;
  type: "DAILY" | "WEEKLY_CHALLENGE";
}

function parsePayload(raw: unknown): NudgePayload | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;

  if (
    typeof p.comercialId !== "string" ||
    typeof p.waId !== "string" ||
    typeof p.comercialName !== "string" ||
    typeof p.theme !== "string" ||
    typeof p.themeLabel !== "string" ||
    typeof p.weekNumber !== "number" ||
    typeof p.dayOfWeek !== "number" ||
    (p.type !== "DAILY" && p.type !== "WEEKLY_CHALLENGE")
  ) {
    return null;
  }

  return {
    comercialId: p.comercialId,
    waId: p.waId,
    comercialName: p.comercialName,
    theme: p.theme,
    themeLabel: p.themeLabel,
    weekNumber: p.weekNumber,
    dayOfWeek: p.dayOfWeek,
    type: p.type,
  };
}

export async function handleSendDevExerciseNudge(
  job: JobRecord,
): Promise<HandlerResult> {
  const payload = parsePayload(job.payload);
  if (!payload) {
    return {
      success: false,
      error: "SEND_DEV_EXERCISE_NUDGE: payload incompleto",
      permanent: true,
    };
  }

  const {
    comercialId,
    waId,
    comercialName,
    theme,
    themeLabel,
    weekNumber,
    dayOfWeek,
    type,
  } = payload;

  const exercise = await prisma.devProgramExercise.upsert({
    where: {
      comercialId_weekNumber_dayOfWeek_type: {
        comercialId,
        weekNumber,
        dayOfWeek,
        type: type as never,
      },
    },
    create: {
      comercialId,
      waId,
      type: type as never,
      theme,
      weekNumber,
      dayOfWeek,
      status: "NUDGE_SENT" as never,
      nudgeSentAt: new Date(),
    },
    update: {},
  });

  if (exercise.nudgeSentAt && exercise.status !== ("NUDGE_SENT" as never)) {
    console.log(
      `[dev-program] SEND_DEV_EXERCISE_NUDGE para ${comercialId} semana=${weekNumber} dia=${dayOfWeek} tipo=${type} — ya procesado, skip`,
    );
    return { success: true };
  }

  const exerciseTypeLabel =
    type === "WEEKLY_CHALLENGE" ? "reto semanal" : "micro-ejercicio";

  try {
    await sendDevExerciseNudge(waId, {
      comercialName,
      exerciseTypeLabel,
      themeLabel,
    });

    await prisma.devProgramExercise.update({
      where: { id: exercise.id },
      data: { nudgeSentAt: new Date() },
    });

    console.log(
      `[dev-program] SEND_DEV_EXERCISE_NUDGE ${type} para ${comercialName} (${waId}) — enviado. Tema: ${themeLabel}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[dev-program] SEND_DEV_EXERCISE_NUDGE para ${comercialName} (${waId}) — error: ${message}`,
    );
    return { success: false, error: message };
  }

  return { success: true };
}
