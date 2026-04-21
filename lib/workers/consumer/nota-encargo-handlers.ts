/**
 * Job + Event handlers for the Nota de Encargo flow.
 *
 * Jobs:
 *  - NOTA_ENCARGO_RECORDATORIO        → sends WhatsApp reminder 2h before visit
 *  - NOTA_ENCARGO_CHECK_CONFIRMACION  → checks if owner confirmed; notifies comercial if not
 *  - NOTA_ENCARGO_ENVIAR_FORMULARIO   → sends WhatsApp Flow form at visit time
 *
 * Event:
 *  - NOTA_ENCARGO_FORMULARIO_COMPLETADO → generates PDF + initiates signature
 */

import type { JobRecord } from "@/lib/job-queue/types";
import type { Event } from "@/types/domain";
import type { HandlerResult } from "./types";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store";
import { enqueueJob } from "@/lib/job-queue";
import { resolveComercial } from "@/lib/routing/resolve-comercial";
import {
  sendNotaEncargoRecordatorio,
  sendNotaEncargoNoConfirmada,
  sendNotaEncargoFlow,
} from "@/lib/nota-encargo/whatsapp";
import { handleNotaEncargoFlowResponse } from "@/lib/nota-encargo/send-to-signature";

// ---------------------------------------------------------------------------
// Job: NOTA_ENCARGO_RECORDATORIO
// ---------------------------------------------------------------------------

export async function handleNotaEncargoRecordatorio(
  job: JobRecord,
): Promise<HandlerResult> {
  const { sessionId } = job.payload as { sessionId: string };
  const session = await prisma.notaEncargoSession.findUniqueOrThrow({
    where: { id: sessionId },
  });

  if (session.state !== "PENDING") return { success: true };

  await sendNotaEncargoRecordatorio(session.propietarioPhone, {
    propertyRef: session.propertyRef,
    direccion: session.direccion,
    visitTime: session.visitDateTime,
  });

  await prisma.notaEncargoSession.update({
    where: { id: sessionId },
    data: { state: "RECORDATORIO_ENVIADO" },
  });

  const horizonMs = session.visitDateTime.getTime() - Date.now();
  if (horizonMs >= 45 * 60 * 1000) {
    const checkAt = new Date(
      session.visitDateTime.getTime() - 30 * 60 * 1000,
    );
    await enqueueJob({
      type: "NOTA_ENCARGO_CHECK_CONFIRMACION",
      payload: { sessionId },
      availableAt: new Date(Math.max(checkAt.getTime(), Date.now() + 60_000)),
      idempotencyKey: `nota_encargo_check:${sessionId}`,
    });
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// Job: NOTA_ENCARGO_CHECK_CONFIRMACION
// ---------------------------------------------------------------------------

export async function handleNotaEncargoCheckConfirmacion(
  job: JobRecord,
): Promise<HandlerResult> {
  const { sessionId } = job.payload as { sessionId: string };
  const session = await prisma.notaEncargoSession.findUniqueOrThrow({
    where: { id: sessionId },
  });

  if (
    session.state === "CONFIRMADA" ||
    session.state === "FORMULARIO_ENVIADO"
  ) {
    return { success: true };
  }

  if (session.state !== "RECORDATORIO_ENVIADO") return { success: true };

  const comercial = await resolveComercial({
    comercialId: session.comercialId,
    requireActive: false,
  });

  if (comercial?.telefono) {
    await sendNotaEncargoNoConfirmada(comercial.telefono, {
      propertyRef: session.propertyRef,
      direccion: session.direccion,
      visitTime: session.visitDateTime,
    });
  }

  await prisma.notaEncargoSession.update({
    where: { id: sessionId },
    data: { state: "NO_CONFIRMADA" },
  });

  await appendEvent({
    type: "NOTA_ENCARGO_NO_CONFIRMADA",
    aggregateType: "PROPERTY",
    aggregateId: session.propertyCode,
    payload: { sessionId },
  });

  return { success: true };
}

// ---------------------------------------------------------------------------
// Job: NOTA_ENCARGO_ENVIAR_FORMULARIO
// ---------------------------------------------------------------------------

export async function handleNotaEncargoEnviarFormulario(
  job: JobRecord,
): Promise<HandlerResult> {
  const { sessionId } = job.payload as { sessionId: string };
  const session = await prisma.notaEncargoSession.findUniqueOrThrow({
    where: { id: sessionId },
  });

  if (session.state !== "CONFIRMADA") return { success: true };

  await sendNotaEncargoFlow(session.propietarioPhone, {
    sessionId: session.id,
    direccion: session.direccion,
    tipoOperacion: session.tipoOperacion,
    precio: session.precio,
    propertyRef: session.propertyRef,
  });

  await prisma.notaEncargoSession.update({
    where: { id: sessionId },
    data: { state: "FORMULARIO_ENVIADO" },
  });

  return { success: true };
}

// ---------------------------------------------------------------------------
// Event: NOTA_ENCARGO_FORMULARIO_COMPLETADO
// ---------------------------------------------------------------------------

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

