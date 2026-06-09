/**
 * Programación de los pasos de la Nota de Encargo en Upstash QStash.
 *
 * Al crear o reprogramar la sesión se publica el formulario con
 * `notBefore = visitDateTime` apuntando a `/api/nota-encargo/formulario`.
 * Si no hay propiedad vinculada, también se programa matching-check N días después.
 *
 * Idempotencia:
 * - Los endpoints comprueban `session.state` y `scheduleGeneration`.
 * - Los messageId se persisten para borrado best-effort al cancelar/reprogramar.
 */

import type { NotaEncargoState } from "@prisma/client";
import { Client } from "@upstash/qstash";
import { prisma } from "@/lib/prisma";
import { getPublicAppUrl } from "@/lib/microsite/app-url";
import { deleteQstashMessage } from "@/lib/qstash/delete-message";

const ROUTES = {
  /** @deprecated Callbacks legacy; el endpoint responde noop. */
  recordatorio: "/api/nota-encargo/recordatorio",
  /** @deprecated Callbacks legacy; el endpoint responde noop. */
  checkConfirmacion: "/api/nota-encargo/check-confirmacion",
  formulario: "/api/nota-encargo/formulario",
  matchingCheck: "/api/nota-encargo/matching-check",
} as const;

export const RESCHEDULABLE_NOTA_ENCARGO_STATES: NotaEncargoState[] = [
  "PENDING",
  "PENDIENTE_PROPIEDAD",
];

export type NotaEncargoScheduleStep = {
  messageId: string;
  sendAtIso: string;
};

export type NotaEncargoScheduleIds = {
  formulario: NotaEncargoScheduleStep;
  matchingCheck: NotaEncargoScheduleStep | null;
};

export class NotaEncargoScheduleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotaEncargoScheduleError";
  }
}

function getQstashClient(): Client {
  const token = process.env.QSTASH_TOKEN?.trim();
  if (!token) {
    throw new NotaEncargoScheduleError(
      "QSTASH_TOKEN no configurado: imposible programar la Nota de Encargo en QStash",
    );
  }
  return new Client({ token });
}

async function publishStep(params: {
  route: string;
  sessionId: string;
  scheduleGeneration: number;
  sendAt: Date;
}): Promise<NotaEncargoScheduleStep> {
  const client = getQstashClient();
  const baseUrl = getPublicAppUrl();
  const now = Date.now();
  const sendAtSec = Math.max(
    Math.floor(params.sendAt.getTime() / 1000),
    Math.floor(now / 1000),
  );

  const response = await client.publishJSON({
    url: `${baseUrl}${params.route}`,
    body: {
      sessionId: params.sessionId,
      scheduleGeneration: params.scheduleGeneration,
    },
    notBefore: sendAtSec,
    retries: 3,
  });

  const messageId =
    typeof (response as { messageId?: unknown }).messageId === "string"
      ? (response as { messageId: string }).messageId
      : "";

  return { messageId, sendAtIso: new Date(sendAtSec * 1000).toISOString() };
}

/** @deprecated Flujo legacy con confirmación del propietario. */
export function publishNotaEncargoRecordatorioSchedule(params: {
  sessionId: string;
  sendAt: Date;
  scheduleGeneration?: number;
}) {
  return publishStep({
    route: ROUTES.recordatorio,
    sessionId: params.sessionId,
    scheduleGeneration: params.scheduleGeneration ?? 0,
    sendAt: params.sendAt,
  });
}

/** @deprecated Flujo legacy con confirmación del propietario. */
export function publishNotaEncargoCheckConfirmacionSchedule(params: {
  sessionId: string;
  sendAt: Date;
  scheduleGeneration?: number;
}) {
  return publishStep({
    route: ROUTES.checkConfirmacion,
    sessionId: params.sessionId,
    scheduleGeneration: params.scheduleGeneration ?? 0,
    sendAt: params.sendAt,
  });
}

export function publishNotaEncargoFormularioSchedule(params: {
  sessionId: string;
  sendAt: Date;
  scheduleGeneration: number;
}) {
  return publishStep({ route: ROUTES.formulario, ...params });
}

export function publishNotaEncargoMatchingCheckSchedule(params: {
  sessionId: string;
  sendAt: Date;
  scheduleGeneration: number;
}) {
  return publishStep({ route: ROUTES.matchingCheck, ...params });
}

export async function publishNotaEncargoSteps(params: {
  sessionId: string;
  visitDateTime: Date;
  scheduleGeneration: number;
  withMatchingCheck: boolean;
  matchingDeadlineDays: number;
}): Promise<NotaEncargoScheduleIds> {
  const formularioSendAt = new Date(
    Math.max(params.visitDateTime.getTime(), Date.now() + 60_000),
  );

  const formulario = await publishNotaEncargoFormularioSchedule({
    sessionId: params.sessionId,
    sendAt: formularioSendAt,
    scheduleGeneration: params.scheduleGeneration,
  });

  let matchingCheck: NotaEncargoScheduleStep | null = null;
  if (params.withMatchingCheck) {
    const matchingDeadline = new Date(
      params.visitDateTime.getTime() +
        params.matchingDeadlineDays * 24 * 60 * 60 * 1000,
    );
    matchingCheck = await publishNotaEncargoMatchingCheckSchedule({
      sessionId: params.sessionId,
      sendAt: matchingDeadline,
      scheduleGeneration: params.scheduleGeneration,
    });
  }

  return { formulario, matchingCheck };
}

export async function persistNotaEncargoScheduleIds(
  sessionId: string,
  schedules: NotaEncargoScheduleIds,
): Promise<void> {
  await prisma.notaEncargoSession.update({
    where: { id: sessionId },
    data: {
      formularioQstashMessageId: schedules.formulario.messageId || null,
      matchingCheckQstashMessageId: schedules.matchingCheck?.messageId || null,
    },
  });
}

/**
 * Programa el envío del formulario al comercial en la hora de la visita y,
 * si aplica, el matching check diferido.
 */
export async function scheduleNotaEncargoInitialSteps(params: {
  sessionId: string;
  visitDateTime: Date;
  withMatchingCheck: boolean;
  matchingDeadlineDays: number;
  scheduleGeneration?: number;
}): Promise<NotaEncargoScheduleIds> {
  return publishNotaEncargoSteps({
    ...params,
    scheduleGeneration: params.scheduleGeneration ?? 0,
  });
}

type NotaEncargoQstashSession = {
  id: string;
  formularioQstashMessageId: string | null;
  matchingCheckQstashMessageId: string | null;
};

export async function cancelNotaEncargoQstashSchedules(
  session: NotaEncargoQstashSession,
): Promise<{ formularioDeleted: boolean; matchingCheckDeleted: boolean }> {
  let formularioDeleted = false;
  let matchingCheckDeleted = false;

  if (session.formularioQstashMessageId) {
    formularioDeleted = await deleteQstashMessage(
      session.formularioQstashMessageId,
    );
  }
  if (session.matchingCheckQstashMessageId) {
    matchingCheckDeleted = await deleteQstashMessage(
      session.matchingCheckQstashMessageId,
    );
  }

  if (
    session.formularioQstashMessageId ||
    session.matchingCheckQstashMessageId
  ) {
    await prisma.notaEncargoSession.update({
      where: { id: session.id },
      data: {
        formularioQstashMessageId: null,
        matchingCheckQstashMessageId: null,
      },
    });
  }

  return { formularioDeleted, matchingCheckDeleted };
}

export async function rescheduleNotaEncargoSteps(params: {
  sessionId: string;
  visitDateTime: Date;
  withMatchingCheck: boolean;
  matchingDeadlineDays: number;
}): Promise<{
  scheduleGeneration: number;
  formulario: NotaEncargoScheduleStep;
  matchingCheck: NotaEncargoScheduleStep | null;
  qstashDeleted: { formularioDeleted: boolean; matchingCheckDeleted: boolean };
}> {
  const session = await prisma.notaEncargoSession.findUnique({
    where: { id: params.sessionId },
    select: {
      id: true,
      state: true,
      formularioQstashMessageId: true,
      matchingCheckQstashMessageId: true,
      scheduleGeneration: true,
    },
  });

  if (!session) {
    throw new NotaEncargoScheduleError("Nota de encargo no encontrada");
  }

  if (!RESCHEDULABLE_NOTA_ENCARGO_STATES.includes(session.state)) {
    throw new NotaEncargoScheduleError(
      `No se puede reprogramar una nota en estado ${session.state}`,
    );
  }

  const qstashDeleted = await cancelNotaEncargoQstashSchedules(session);
  const nextGeneration = session.scheduleGeneration + 1;

  await prisma.notaEncargoSession.update({
    where: { id: session.id },
    data: {
      visitDateTime: params.visitDateTime,
      scheduleGeneration: nextGeneration,
      formularioQstashMessageId: null,
      matchingCheckQstashMessageId: null,
    },
  });

  const schedules = await publishNotaEncargoSteps({
    sessionId: session.id,
    visitDateTime: params.visitDateTime,
    scheduleGeneration: nextGeneration,
    withMatchingCheck: params.withMatchingCheck,
    matchingDeadlineDays: params.matchingDeadlineDays,
  });

  await persistNotaEncargoScheduleIds(session.id, schedules);

  return {
    scheduleGeneration: nextGeneration,
    formulario: schedules.formulario,
    matchingCheck: schedules.matchingCheck,
    qstashDeleted,
  };
}
