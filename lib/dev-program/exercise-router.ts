/**
 * M12 — Programas de Desarrollo Continuo: routing de mensajes WhatsApp.
 *
 * Intercepta dos tipos de mensaje antes de que lleguen al bot mental o al NLU:
 * 1. `/coach ejercicio` → genera y envía el ejercicio pendiente del día
 * 2. "hecho" / "listo" / "completado" → marca el ejercicio como completado
 */

import type { Event } from "@/types/domain";
import type { HandlerResult } from "@/lib/workers/consumer/types";
import { prisma } from "@/lib/prisma";
import { sendTextMessage } from "@/lib/whatsapp";
import { generateExercise } from "./generate-exercise";
import { DEV_THEMES, type DevExerciseCrmContext } from "./types";

const EXERCISE_REQUEST_RE = /^\/?coach\s+ejercicio\b/i;
const COMPLETION_RE = /^(hecho|listo|completado)\s*[.!]?\s*$/i;

export function isExerciseRequest(messageText: string): boolean {
  return EXERCISE_REQUEST_RE.test(messageText.trim());
}

export function isExerciseCompletion(messageText: string): boolean {
  return COMPLETION_RE.test(messageText.trim());
}

const MS_PER_DAY = 86_400_000;

async function loadCrmContextForComercial(
  comercialId: string,
): Promise<DevExerciseCrmContext | null> {
  try {
    const comercial = await prisma.comercial.findUnique({
      where: { id: comercialId },
      select: { nombre: true, ciudad: true },
    });

    if (!comercial) return null;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [visitasHoy, opsPendientes, opsCanceladas, cierresRecientes] =
      await Promise.all([
        prisma.commercialVisitFact.count({
          where: {
            comercialId,
            scheduledAt: { gte: todayStart, lte: todayEnd },
          },
        }),
        prisma.operacion.count({
          where: {
            comercialId,
            estado: { in: ["ARRAS", "PENDIENTE_FIRMA"] },
          },
        }),
        prisma.operacion.count({
          where: {
            comercialId,
            estado: "CANCELADA",
            updatedAt: { gte: new Date(Date.now() - 14 * MS_PER_DAY) },
          },
        }),
        prisma.commercialOperationFact.count({
          where: {
            comercialId,
            closedAt: { gte: new Date(Date.now() - 30 * MS_PER_DAY) },
          },
        }),
      ]);

    return {
      nombreComercial: comercial.nombre,
      ciudad: comercial.ciudad ?? "desconocida",
      cierresPendientesHoy: visitasHoy + opsPendientes,
      operacionPerdidaReciente: opsCanceladas > 0,
      rachaPositiva: cierresRecientes >= 2,
    };
  } catch {
    return null;
  }
}

async function findPendingExercise(waId: string) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  return prisma.devProgramExercise.findFirst({
    where: {
      waId,
      status: "NUDGE_SENT" as never,
      createdAt: { gte: todayStart },
    },
    orderBy: { createdAt: "desc" },
  });
}

async function findDeliveredExercise(waId: string) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  return prisma.devProgramExercise.findFirst({
    where: {
      waId,
      status: "DELIVERED" as never,
      createdAt: { gte: todayStart },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function handleExerciseRequest(
  _event: Event,
  waId: string,
): Promise<HandlerResult> {
  const exercise = await findPendingExercise(waId);

  if (!exercise) {
    const delivered = await findDeliveredExercise(waId);
    if (delivered) {
      await sendTextMessage(
        waId,
        "Ya tienes el ejercicio de hoy. Cuando lo hagas, escribe 'hecho'.",
      );
    } else {
      await sendTextMessage(
        waId,
        "Hoy no hay ejercicio pendiente. Mañana a primera hora tendrás uno nuevo.",
      );
    }
    return { success: true };
  }

  const theme = DEV_THEMES.find((t) => t.id === exercise.theme);
  if (!theme) {
    await sendTextMessage(waId, "Error interno con el tema del ejercicio. Avisa al equipo.");
    return { success: false, error: `Tema desconocido: ${exercise.theme}`, permanent: true };
  }

  const crmContext = await loadCrmContextForComercial(exercise.comercialId);

  const content = await generateExercise({
    theme,
    type: exercise.type as "DAILY" | "WEEKLY_CHALLENGE",
    dayOfWeek: exercise.dayOfWeek ?? 1,
    weekNumber: exercise.weekNumber,
    crmContext,
  });

  await sendTextMessage(waId, content);

  await prisma.devProgramExercise.update({
    where: { id: exercise.id },
    data: {
      status: "DELIVERED" as never,
      exerciseContent: content,
      deliveredAt: new Date(),
    },
  });

  await sendTextMessage(
    waId,
    "Cuando lo termines, escribe 'hecho'. Así llevo la cuenta.",
  );

  console.log(
    `[dev-program] Ejercicio ${exercise.type} entregado a waId=${waId}. Tema: ${theme.label}`,
  );

  return { success: true };
}

export async function handleExerciseCompletion(
  _event: Event,
  waId: string,
): Promise<HandlerResult | null> {
  const exercise = await findDeliveredExercise(waId);

  if (!exercise) return null;

  await prisma.devProgramExercise.update({
    where: { id: exercise.id },
    data: {
      status: "COMPLETED" as never,
      completedAt: new Date(),
    },
  });

  await sendTextMessage(waId, "Anotado. Mañana más.");

  console.log(
    `[dev-program] Ejercicio ${exercise.type} completado por waId=${waId}. Tema: ${exercise.theme}`,
  );

  return { success: true };
}

/**
 * Intenta routear el mensaje a desarrollo continuo.
 * Retorna HandlerResult si fue manejado, null si el mensaje no es para este módulo.
 */
export async function routeToDevProgramIfApplicable(
  event: Event,
  messageText: string,
  waId: string,
): Promise<HandlerResult | null> {
  if (isExerciseRequest(messageText)) {
    return handleExerciseRequest(event, waId);
  }

  if (isExerciseCompletion(messageText)) {
    return handleExerciseCompletion(event, waId);
  }

  return null;
}
