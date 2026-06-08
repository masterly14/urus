/**
 * Handlers legacy de Nota de Encargo en el consumer.
 *
 * El flujo activo se programa en QStash y se ejecuta vía
 * `/api/nota-encargo/{formulario,matching-check}`. Los endpoints
 * `recordatorio` y `check-confirmacion` responden `deprecated_noop`.
 *
 * Se mantienen como red de seguridad para drenar jobs remanentes en
 * `job_queue` (ver `scripts/migrate-nota-encargo-to-qstash.ts`).
 * Recordatorio y check delegan en stubs noop; formulario y matching-check
 * delegan en `lib/nota-encargo/send.ts`.
 *
 * El handler de evento `NOTA_ENCARGO_FORMULARIO_COMPLETADO` sigue activo y
 * procesa la firma del comercial.
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
