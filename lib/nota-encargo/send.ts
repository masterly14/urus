/**
 * Envío síncrono de los pasos de la Nota de Encargo.
 *
 * Funciones puras idempotentes invocadas desde los endpoints dedicados
 * `/api/nota-encargo/{recordatorio,check-confirmacion,formulario,matching-check}`
 * (callbacks de QStash) y, como red de seguridad, desde el job handler legacy
 * y los scripts de rescate.
 *
 * Idempotencia: cada función comprueba `session.state` antes de actuar y hace
 * no-op si la sesión ya no está en el estado esperado. Esto permite que QStash
 * no necesite cancelar mensajes al cancelar una nota; el callback llega, ve
 * `CANCELADA` y devuelve `noop_*`.
 */

import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store";
import { resolveComercial } from "@/lib/routing/resolve-comercial";
import { normalizeComercialWhatsappPhone } from "@/lib/routing/comercial-whatsapp";
import {
  sendNotaEncargoRecordatorio,
  sendNotaEncargoNoConfirmada,
  sendNotaEncargoFlow,
} from "@/lib/nota-encargo/whatsapp";
import { publishNotaEncargoCheckConfirmacionSchedule } from "@/lib/nota-encargo/schedule";

export type NotaEncargoSendResult =
  | { ok: true; status:
      | "sent"
      | "noop_state"
      | "noop_missing_session"
      | "noop_no_phone"
      | "noop_property_linked"
      | "noop_cancelled"
      | "skipped_check_schedule_too_close"
      | "deadline_emitted";
      sessionState?: string;
    }
  | { ok: false; permanent: boolean; error: string };

function failMissingSession(sessionId: string): NotaEncargoSendResult {
  return {
    ok: false,
    permanent: true,
    error: `NotaEncargoSession ${sessionId} no encontrada`,
  };
}

// ---------------------------------------------------------------------------
// Recordatorio (2h antes de la visita)
// ---------------------------------------------------------------------------

export async function sendNotaEncargoRecordatorioForSession(
  sessionId: string,
): Promise<NotaEncargoSendResult> {
  if (!sessionId) {
    return { ok: false, permanent: true, error: "sessionId vacío" };
  }

  const session = await prisma.notaEncargoSession.findUnique({
    where: { id: sessionId },
  });
  if (!session) return failMissingSession(sessionId);

  if (session.state !== "PENDING" && session.state !== "PENDIENTE_PROPIEDAD") {
    return { ok: true, status: "noop_state", sessionState: session.state };
  }

  const displayRef = session.propertyRef ?? session.refCatastral ?? session.id;

  try {
    await sendNotaEncargoRecordatorio(
      session.propietarioPhone,
      {
        propertyRef: displayRef,
        direccion: session.direccion,
        visitTime: session.visitDateTime,
      },
      {
        trace: {
          source: "nota_encargo_recordatorio_job",
          kind: "nota_encargo_recordatorio",
          aggregateId: session.propietarioPhone,
          payload: {
            sessionId,
            notaEncargoState: session.state,
            propertyCode: session.propertyCode,
          },
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[nota-encargo] Error enviando recordatorio a ${session.propietarioPhone}: ${message}`,
    );
    return { ok: false, permanent: false, error: message };
  }

  await prisma.notaEncargoSession.update({
    where: { id: sessionId },
    data: { state: "RECORDATORIO_ENVIADO" },
  });

  const horizonMs = session.visitDateTime.getTime() - Date.now();
  if (horizonMs >= 45 * 60 * 1000) {
    const checkAt = new Date(session.visitDateTime.getTime() - 30 * 60 * 1000);
    const sendAt = new Date(Math.max(checkAt.getTime(), Date.now() + 60_000));
    try {
      await publishNotaEncargoCheckConfirmacionSchedule({
        sessionId,
        sendAt,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[nota-encargo] Error programando CHECK_CONFIRMACION en QStash para ${sessionId}: ${message}`,
      );
      return { ok: false, permanent: false, error: message };
    }
    return { ok: true, status: "sent" };
  }

  return { ok: true, status: "skipped_check_schedule_too_close" };
}

// ---------------------------------------------------------------------------
// Check confirmación (30 min antes de la visita)
// ---------------------------------------------------------------------------

export async function checkNotaEncargoConfirmacionForSession(
  sessionId: string,
): Promise<NotaEncargoSendResult> {
  if (!sessionId) {
    return { ok: false, permanent: true, error: "sessionId vacío" };
  }

  const session = await prisma.notaEncargoSession.findUnique({
    where: { id: sessionId },
  });
  if (!session) return failMissingSession(sessionId);

  if (session.state === "CONFIRMADA" || session.state === "FORMULARIO_ENVIADO") {
    return { ok: true, status: "noop_state", sessionState: session.state };
  }
  if (session.state === "CANCELADA") {
    return { ok: true, status: "noop_cancelled" };
  }
  if (session.state !== "RECORDATORIO_ENVIADO") {
    return { ok: true, status: "noop_state", sessionState: session.state };
  }

  const comercial = await resolveComercial({
    comercialId: session.comercialId,
    requireActive: false,
  });

  if (comercial?.telefono) {
    const displayRef = session.propertyRef ?? session.refCatastral ?? session.id;
    try {
      await sendNotaEncargoNoConfirmada(
        comercial.telefono,
        {
          propertyRef: displayRef,
          direccion: session.direccion,
          visitTime: session.visitDateTime,
        },
        {
          trace: {
            source: "nota_encargo_check_confirmacion_job",
            kind: "nota_encargo_no_confirmada",
            aggregateId: comercial.telefono,
            payload: {
              sessionId,
              notaEncargoState: session.state,
              comercialId: session.comercialId,
              propertyCode: session.propertyCode,
            },
          },
        },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[nota-encargo] Error avisando no confirmada al comercial ${comercial.telefono}: ${message}`,
      );
      return { ok: false, permanent: false, error: message };
    }
  }

  await prisma.notaEncargoSession.update({
    where: { id: sessionId },
    data: { state: "NO_CONFIRMADA" },
  });

  await appendEvent({
    type: "NOTA_ENCARGO_NO_CONFIRMADA",
    aggregateType: "PROPERTY",
    aggregateId: session.propertyCode ?? session.refCatastral ?? session.id,
    payload: {
      sessionId,
      propertyRef: session.propertyRef,
      refCatastral: session.refCatastral,
    },
  });

  return {
    ok: true,
    status: comercial?.telefono ? "sent" : "noop_no_phone",
  };
}

// ---------------------------------------------------------------------------
// Formulario (en el instante exacto de la visita)
// ---------------------------------------------------------------------------

export async function sendNotaEncargoFormularioForSession(
  sessionId: string,
): Promise<NotaEncargoSendResult> {
  if (!sessionId) {
    return { ok: false, permanent: true, error: "sessionId vacío" };
  }

  const session = await prisma.notaEncargoSession.findUnique({
    where: { id: sessionId },
  });
  if (!session) return failMissingSession(sessionId);

  if (session.state !== "CONFIRMADA") {
    return { ok: true, status: "noop_state", sessionState: session.state };
  }

  const comercial = await resolveComercial({
    comercialId: session.comercialId,
    requireActive: false,
  });
  const comercialPhone = normalizeComercialWhatsappPhone(comercial);
  if (!comercialPhone) {
    return { ok: true, status: "noop_no_phone" };
  }

  const displayRef = session.propertyRef ?? session.refCatastral ?? session.id;

  try {
    await sendNotaEncargoFlow(
      comercialPhone,
      {
        sessionId: session.id,
        direccion: session.direccion,
        tipoOperacion: session.tipoOperacion,
        precio: session.precio,
        propertyRef: displayRef,
        refCatastral: session.refCatastral,
      },
      {
        trace: {
          source: "nota_encargo_enviar_formulario_job",
          kind: "nota_encargo_formulario",
          aggregateId: comercialPhone,
          payload: {
            sessionId,
            notaEncargoState: session.state,
            propertyCode: session.propertyCode,
            comercialId: session.comercialId,
          },
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[nota-encargo] Error enviando Flow a ${session.propietarioPhone}: ${message}`,
    );
    return { ok: false, permanent: false, error: message };
  }

  await prisma.notaEncargoSession.update({
    where: { id: sessionId },
    data: { state: "FORMULARIO_ENVIADO" },
  });

  return { ok: true, status: "sent" };
}

// ---------------------------------------------------------------------------
// Matching check (días después de la visita si no hay propiedad)
// ---------------------------------------------------------------------------

export async function runNotaEncargoMatchingCheckForSession(
  sessionId: string,
): Promise<NotaEncargoSendResult> {
  if (!sessionId) {
    return { ok: false, permanent: true, error: "sessionId vacío" };
  }

  const session = await prisma.notaEncargoSession.findUnique({
    where: { id: sessionId },
  });
  if (!session) return failMissingSession(sessionId);

  if (session.state === "CANCELADA") {
    return { ok: true, status: "noop_cancelled" };
  }
  if (session.propertyCode) {
    return { ok: true, status: "noop_property_linked" };
  }

  const daysElapsed = Math.max(
    0,
    Math.floor(
      (Date.now() - session.visitDateTime.getTime()) / (24 * 60 * 60 * 1000),
    ),
  );

  await appendEvent({
    type: "NOTA_ENCARGO_SIN_PROPIEDAD_DEADLINE",
    aggregateType: "PROPERTY",
    aggregateId: session.refCatastral ?? session.id,
    payload: {
      sessionId: session.id,
      propertyRef: session.propertyRef,
      refCatastral: session.refCatastral,
      daysElapsed,
    },
  });

  return { ok: true, status: "deadline_emitted" };
}
