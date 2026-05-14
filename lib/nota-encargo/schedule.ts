/**
 * Programación de los pasos de la Nota de Encargo en Upstash QStash.
 *
 * Cada paso del flujo se publica como un mensaje diferido en QStash con
 * `notBefore = <fecha objetivo>` y apunta al endpoint dedicado correspondiente
 * (`/api/nota-encargo/{recordatorio,check-confirmacion,formulario,matching-check}`).
 * QStash invoca el endpoint en el instante exacto y se ejecuta el paso en
 * caliente, sin pasar por la cola interna `job_queue` ni por crons.
 *
 * Idempotencia: los endpoints comprueban `session.state` y hacen no-op si no
 * procede. No se persiste el `messageId` de QStash; al cancelar la sesión, el
 * callback futuro llegará igual y devolverá `noop_cancelled`.
 */

import { Client } from "@upstash/qstash";
import { getPublicAppUrl } from "@/lib/microsite/app-url";

const ROUTES = {
  recordatorio: "/api/nota-encargo/recordatorio",
  checkConfirmacion: "/api/nota-encargo/check-confirmacion",
  formulario: "/api/nota-encargo/formulario",
  matchingCheck: "/api/nota-encargo/matching-check",
} as const;

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
  sendAt: Date;
}): Promise<{ messageId: string; sendAtIso: string }> {
  const client = getQstashClient();
  const baseUrl = getPublicAppUrl();
  const now = Date.now();
  const sendAtSec = Math.max(
    Math.floor(params.sendAt.getTime() / 1000),
    Math.floor(now / 1000),
  );

  const response = await client.publishJSON({
    url: `${baseUrl}${params.route}`,
    body: { sessionId: params.sessionId },
    notBefore: sendAtSec,
    retries: 3,
  });

  const messageId =
    typeof (response as { messageId?: unknown }).messageId === "string"
      ? (response as { messageId: string }).messageId
      : "";

  return { messageId, sendAtIso: new Date(sendAtSec * 1000).toISOString() };
}

export function publishNotaEncargoRecordatorioSchedule(params: {
  sessionId: string;
  sendAt: Date;
}) {
  return publishStep({ route: ROUTES.recordatorio, ...params });
}

export function publishNotaEncargoCheckConfirmacionSchedule(params: {
  sessionId: string;
  sendAt: Date;
}) {
  return publishStep({ route: ROUTES.checkConfirmacion, ...params });
}

export function publishNotaEncargoFormularioSchedule(params: {
  sessionId: string;
  sendAt: Date;
}) {
  return publishStep({ route: ROUTES.formulario, ...params });
}

export function publishNotaEncargoMatchingCheckSchedule(params: {
  sessionId: string;
  sendAt: Date;
}) {
  return publishStep({ route: ROUTES.matchingCheck, ...params });
}

/**
 * Helper combinado: programa recordatorio (2h antes) + matching check (si
 * aplica, X días después). Usado por la API de creación.
 *
 * El CHECK_CONFIRMACION lo programa el propio handler de recordatorio al
 * terminar; el FORMULARIO lo programa el webhook cuando el propietario
 * confirma. Ese encadenamiento dinámico vive en `send.ts` y
 * `lib/nota-encargo/webhook-handler.ts`.
 */
export async function scheduleNotaEncargoInitialSteps(params: {
  sessionId: string;
  visitDateTime: Date;
  withMatchingCheck: boolean;
  matchingDeadlineDays: number;
}): Promise<{
  recordatorio: { messageId: string; sendAtIso: string };
  matchingCheck: { messageId: string; sendAtIso: string } | null;
}> {
  const twoHoursBefore = new Date(
    params.visitDateTime.getTime() - 2 * 60 * 60 * 1000,
  );
  const recordatorioSendAt = new Date(
    Math.max(twoHoursBefore.getTime(), Date.now() + 60_000),
  );

  const recordatorio = await publishNotaEncargoRecordatorioSchedule({
    sessionId: params.sessionId,
    sendAt: recordatorioSendAt,
  });

  let matchingCheck: { messageId: string; sendAtIso: string } | null = null;
  if (params.withMatchingCheck) {
    const matchingDeadline = new Date(
      params.visitDateTime.getTime() +
        params.matchingDeadlineDays * 24 * 60 * 60 * 1000,
    );
    matchingCheck = await publishNotaEncargoMatchingCheckSchedule({
      sessionId: params.sessionId,
      sendAt: matchingDeadline,
    });
  }

  return { recordatorio, matchingCheck };
}
