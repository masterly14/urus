import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store";
import {
  NotaEncargoScheduleError,
  RESCHEDULABLE_NOTA_ENCARGO_STATES,
  rescheduleNotaEncargoSteps,
} from "@/lib/nota-encargo/schedule";
import { validateNotaEncargoVisitDateTime } from "@/lib/nota-encargo/visit-datetime";

const NOTA_ENCARGO_MATCHING_DEADLINE_DAYS = Number(
  process.env.NOTA_ENCARGO_MATCHING_DEADLINE_DAYS || "7",
);

export class NotaEncargoRescheduleError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "NotaEncargoRescheduleError";
  }
}

export type RescheduleNotaEncargoSessionInput = {
  sessionId: string;
  visitDateTime: Date;
  actorComercialId: string | null;
  actorUserId: string;
  isAdmin: boolean;
};

export type RescheduleNotaEncargoSessionResult = {
  sessionId: string;
  visitDateTime: string;
  scheduleGeneration: number;
  formulario: { messageId: string; sendAtIso: string };
  matchingCheck: { messageId: string; sendAtIso: string } | null;
  qstashDeleted: { formularioDeleted: boolean; matchingCheckDeleted: boolean };
};

export async function rescheduleNotaEncargoSession(
  input: RescheduleNotaEncargoSessionInput,
): Promise<RescheduleNotaEncargoSessionResult> {
  const visitDateError = validateNotaEncargoVisitDateTime(input.visitDateTime);
  if (visitDateError) {
    throw new NotaEncargoRescheduleError(visitDateError.error, visitDateError.status);
  }

  const nota = await prisma.notaEncargoSession.findUnique({
    where: { id: input.sessionId },
    select: {
      id: true,
      state: true,
      comercialId: true,
      refCatastral: true,
      propertyCode: true,
      visitDateTime: true,
    },
  });

  if (!nota) {
    throw new NotaEncargoRescheduleError("Nota de encargo no encontrada", 404);
  }

  if (!input.isAdmin && nota.comercialId !== input.actorComercialId) {
    throw new NotaEncargoRescheduleError("Sin permisos", 403);
  }

  if (!RESCHEDULABLE_NOTA_ENCARGO_STATES.includes(nota.state)) {
    throw new NotaEncargoRescheduleError(
      `No se puede reprogramar una nota en estado ${nota.state}`,
      400,
    );
  }

  if (nota.visitDateTime.getTime() === input.visitDateTime.getTime()) {
    throw new NotaEncargoRescheduleError(
      "La nueva fecha y hora deben ser distintas de la actual",
      400,
    );
  }

  if (nota.refCatastral) {
    const duplicate = await prisma.notaEncargoSession.findFirst({
      where: {
        id: { not: nota.id },
        refCatastral: nota.refCatastral,
        visitDateTime: input.visitDateTime,
        comercialId: nota.comercialId,
        state: { not: "CANCELADA" },
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new NotaEncargoRescheduleError(
        "Ya existe otra nota de encargo activa con esa referencia catastral y horario",
        409,
      );
    }
  }

  const previousVisitDateTime = nota.visitDateTime.toISOString();

  let scheduleResult;
  try {
    scheduleResult = await rescheduleNotaEncargoSteps({
      sessionId: nota.id,
      visitDateTime: input.visitDateTime,
      withMatchingCheck: !nota.propertyCode,
      matchingDeadlineDays: NOTA_ENCARGO_MATCHING_DEADLINE_DAYS,
    });
  } catch (err) {
    if (err instanceof NotaEncargoScheduleError) {
      throw err;
    }
    throw err;
  }

  await appendEvent({
    type: "NOTA_ENCARGO_REPROGRAMADA",
    aggregateType: "PROPERTY",
    aggregateId: nota.propertyCode ?? nota.refCatastral ?? nota.id,
    payload: {
      sessionId: nota.id,
      propertyCode: nota.propertyCode,
      refCatastral: nota.refCatastral,
      previousVisitDateTime,
      newVisitDateTime: input.visitDateTime.toISOString(),
      scheduleGeneration: scheduleResult.scheduleGeneration,
      rescheduledBy: input.actorComercialId ?? input.actorUserId,
      qstashDeleted: scheduleResult.qstashDeleted,
    },
  });

  return {
    sessionId: nota.id,
    visitDateTime: input.visitDateTime.toISOString(),
    scheduleGeneration: scheduleResult.scheduleGeneration,
    formulario: scheduleResult.formulario,
    matchingCheck: scheduleResult.matchingCheck,
    qstashDeleted: scheduleResult.qstashDeleted,
  };
}
