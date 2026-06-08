/**
 * Envío síncrono de los pasos de la Nota de Encargo.
 *
 * Funciones puras idempotentes invocadas desde los endpoints dedicados
 * `/api/nota-encargo/{formulario,matching-check}` (callbacks de QStash) y,
 * como red de seguridad, desde el job handler legacy y los scripts de rescate.
 *
 * Idempotencia: cada función comprueba `session.state` antes de actuar y hace
 * no-op si la sesión ya no está en el estado esperado. Esto permite que QStash
 * no necesite cancelar mensajes al cancelar una nota; el callback llega, ve
 * `CANCELADA` y devuelve `noop_*`.
 */

import type { NotaEncargoState } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store";
import { resolveComercial } from "@/lib/routing/resolve-comercial";
import { normalizeComercialWhatsappPhone } from "@/lib/routing/comercial-whatsapp";
import { sendNotaEncargoFlow } from "@/lib/nota-encargo/whatsapp";

const READY_FOR_FORMULARIO: NotaEncargoState[] = [
  "PENDING",
  "PENDIENTE_PROPIEDAD",
];

export type NotaEncargoSendResult =
  | {
      ok: true;
      status:
        | "sent"
        | "already_sent"
        | "noop_state"
        | "noop_missing_session"
        | "noop_no_phone"
        | "noop_property_linked"
        | "noop_cancelled"
        | "deprecated_noop"
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
// Legacy: recordatorio y check confirmación (flujo con confirmación eliminado)
// ---------------------------------------------------------------------------

/** @deprecated El flujo ya no envía recordatorio al propietario. */
export async function sendNotaEncargoRecordatorioForSession(
  sessionId: string,
): Promise<NotaEncargoSendResult> {
  if (!sessionId) {
    return { ok: false, permanent: true, error: "sessionId vacío" };
  }
  console.log(
    `[nota-encargo] sendNotaEncargoRecordatorioForSession deprecated noop — session=${sessionId}`,
  );
  return { ok: true, status: "deprecated_noop" };
}

/** @deprecated El flujo ya no comprueba confirmación del propietario. */
export async function checkNotaEncargoConfirmacionForSession(
  sessionId: string,
): Promise<NotaEncargoSendResult> {
  if (!sessionId) {
    return { ok: false, permanent: true, error: "sessionId vacío" };
  }
  console.log(
    `[nota-encargo] checkNotaEncargoConfirmacionForSession deprecated noop — session=${sessionId}`,
  );
  return { ok: true, status: "deprecated_noop" };
}

// ---------------------------------------------------------------------------
// Formulario (en el instante exacto de la visita → comercial)
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

  if (session.state === "CANCELADA") {
    return { ok: true, status: "noop_cancelled" };
  }

  if (!READY_FOR_FORMULARIO.includes(session.state)) {
    if (session.state === "FORMULARIO_ENVIADO") {
      return { ok: true, status: "already_sent", sessionState: session.state };
    }
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

  const priorState = session.state;
  const displayRef = session.propertyRef ?? session.refCatastral ?? session.id;

  const claim = await prisma.notaEncargoSession.updateMany({
    where: { id: sessionId, state: priorState },
    data: { state: "FORMULARIO_ENVIADO" },
  });
  if (claim.count === 0) {
    const fresh = await prisma.notaEncargoSession.findUnique({
      where: { id: sessionId },
      select: { state: true },
    });
    console.log(
      `[nota-encargo] Race condition en session=${sessionId}: otro proceso transicionó a ${fresh?.state ?? "?"}. Saltando envío del Flow.`,
    );
    return {
      ok: true,
      status:
        fresh?.state === "FORMULARIO_ENVIADO" ? "already_sent" : "noop_state",
      sessionState: fresh?.state,
    };
  }

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
            notaEncargoState: priorState,
            propertyCode: session.propertyCode,
            comercialId: session.comercialId,
          },
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[nota-encargo] Error enviando Flow a ${comercialPhone} (session=${sessionId}): ${message}`,
    );
    await prisma.notaEncargoSession.updateMany({
      where: { id: sessionId, state: "FORMULARIO_ENVIADO" },
      data: { state: priorState },
    });
    return { ok: false, permanent: false, error: `flow: ${message}` };
  }

  console.log(
    `[nota-encargo] Flow sent to comercial ${comercialPhone} — session=${sessionId}`,
  );

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
