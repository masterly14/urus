/**
 * Handlers legacy de Nota de Encargo en el consumer.
 *
 * Estos handlers ya **no se usan en el camino feliz**: el flujo se programa
 * directamente en QStash y se ejecuta vía
 * `/api/nota-encargo/{recordatorio,check-confirmacion,formulario,matching-check}`.
 *
 * Se mantienen como **red de seguridad** para drenar cualquier job que aún
 * quede en `job_queue` por la migración (ver `scripts/migrate-nota-encargo-to-qstash.ts`)
 * o por un rescate manual. Cada handler delega en la función pura idempotente
 * de `lib/nota-encargo/send.ts`, que ya respeta la transición de estados y
 * encadena el siguiente paso vía QStash (recordatorio → check_confirmacion).
 *
 * El handler de evento `NOTA_ENCARGO_FORMULARIO_COMPLETADO` sigue activo y
 * procesa la firma del propietario.
 */

import type { JobRecord } from "@/lib/job-queue/types";
import type { Event } from "@/types/domain";
import type { HandlerResult } from "./types";
import { prisma } from "@/lib/prisma";
import {
  sendNotaEncargoRecordatorioForSession,
  checkNotaEncargoConfirmacionForSession,
  sendNotaEncargoFormularioForSession,
  runNotaEncargoMatchingCheckForSession,
  type NotaEncargoSendResult,
} from "@/lib/nota-encargo/send";
import { handleNotaEncargoFlowResponse } from "@/lib/nota-encargo/send-to-signature";

function toHandlerResult(r: NotaEncargoSendResult): HandlerResult {
  if (r.ok) return { success: true };
  return { success: false, error: r.error, permanent: r.permanent };
}

export async function handleNotaEncargoRecordatorio(
  job: JobRecord,
): Promise<HandlerResult> {
  const { sessionId } = job.payload as { sessionId: string };
  const result = await sendNotaEncargoRecordatorioForSession(sessionId);
  return toHandlerResult(result);
}

export async function handleNotaEncargoCheckConfirmacion(
  job: JobRecord,
): Promise<HandlerResult> {
  const { sessionId } = job.payload as { sessionId: string };
  const result = await checkNotaEncargoConfirmacionForSession(sessionId);
  return toHandlerResult(result);
}

export async function handleNotaEncargoEnviarFormulario(
  job: JobRecord,
): Promise<HandlerResult> {
  const { sessionId } = job.payload as { sessionId: string };
  const result = await sendNotaEncargoFormularioForSession(sessionId);
  return toHandlerResult(result);
}

export async function handleNotaEncargoMatchingCheck(
  job: JobRecord,
): Promise<HandlerResult> {
  const { sessionId } = job.payload as { sessionId: string };
  const result = await runNotaEncargoMatchingCheckForSession(sessionId);
  return toHandlerResult(result);
}

export async function handleNotaEncargoFormularioCompletado(
  event: Event,
): Promise<HandlerResult> {
  const payload = event.payload as {
    sessionId: string;
    formData: Record<string, unknown>;
  } | null;

  if (!payload?.sessionId) {
    return {
      success: false,
      error: "NOTA_ENCARGO_FORMULARIO_COMPLETADO: missing sessionId",
      permanent: true,
    };
  }

  const session = await prisma.notaEncargoSession.findUnique({
    where: { id: payload.sessionId },
  });

  if (!session || session.state !== "FORMULARIO_ENVIADO") {
    return { success: true };
  }

  await handleNotaEncargoFlowResponse(session, payload.formData);
  return { success: true };
}
