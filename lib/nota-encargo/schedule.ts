/**
 * Programación de los pasos de la Nota de Encargo en Upstash QStash.
 *
 * Al crear la sesión se publica el formulario con `notBefore = visitDateTime`
 * apuntando a `/api/nota-encargo/formulario`. Si no hay propiedad vinculada,
 * también se programa matching-check N días después.
 *
 * Idempotencia: los endpoints comprueban `session.state` y hacen no-op si no
 * procede. No se persiste el `messageId` de QStash; al cancelar la sesión, el
 * callback futuro llegará igual y devolverá `noop_cancelled`.
 */

import { Client } from "@upstash/qstash";
import { getPublicAppUrl } from "@/lib/microsite/app-url";

const ROUTES = {
  /** @deprecated Callbacks legacy; el endpoint responde noop. */
  recordatorio: "/api/nota-encargo/recordatorio",
  /** @deprecated Callbacks legacy; el endpoint responde noop. */
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

/** @deprecated Flujo legacy con confirmación del propietario. */
export function publishNotaEncargoRecordatorioSchedule(params: {
  sessionId: string;
  sendAt: Date;
}) {
  return publishStep({ route: ROUTES.recordatorio, ...params });
}

/** @deprecated Flujo legacy con confirmación del propietario. */
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
 * Programa el envío del formulario al comercial en la hora de la visita y,
 * si aplica, el matching check diferido.
 */
export async function scheduleNotaEncargoInitialSteps(params: {
  sessionId: string;
  visitDateTime: Date;
  withMatchingCheck: boolean;
  matchingDeadlineDays: number;
}): Promise<{
  formulario: { messageId: string; sendAtIso: string };
  matchingCheck: { messageId: string; sendAtIso: string } | null;
}> {
  const formularioSendAt = new Date(
    Math.max(params.visitDateTime.getTime(), Date.now() + 60_000),
  );

  const formulario = await publishNotaEncargoFormularioSchedule({
    sessionId: params.sessionId,
    sendAt: formularioSendAt,
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

  return { formulario, matchingCheck };
}
