/**
 * Job handler for the Parte de Visita flow.
 *
 * PARTE_VISITA_ENVIAR_FORMULARIO:
 *   Triggered at the visit start time (confirmedSlotStart).
 *   Sends the WhatsApp Flow to the buyer to collect their data.
 */

import { prisma } from "@/lib/prisma";
import { resolveComercial } from "@/lib/routing/resolve-comercial";
import { sendParteVisitaFlow } from "@/lib/parte-visita/whatsapp";
import type { JobRecord } from "@/lib/job-queue/types";
import type { HandlerResult } from "./types";

export async function handleParteVisitaEnviarFormulario(
  job: JobRecord,
): Promise<HandlerResult> {
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : "";

  if (!sessionId) {
    return {
      success: false,
      error: "PARTE_VISITA_ENVIAR_FORMULARIO: missing sessionId",
      permanent: true,
    };
  }

  const session = await prisma.parteVisitaSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    return {
      success: false,
      error: `ParteVisitaSession ${sessionId} not found`,
      permanent: true,
    };
  }

  if (session.state !== "PENDING") {
    console.log(
      `[parte-visita] Session ${sessionId} not in PENDING state (${session.state}) — skipping`,
    );
    return { success: true };
  }

  const comercial = await resolveComercial({
    comercialId: session.comercialId,
    requireActive: false,
  });
  const agenteName = comercial?.nombre ?? "URUS Capital Group";

  const fechaVisita = session.visitDateTime.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const horaVisita = session.visitDateTime.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });

  try {
    await sendParteVisitaFlow(session.buyerPhone, {
      sessionId: session.id,
      direccion: session.direccion,
      tipoOperacion: session.tipoOperacion,
      precio: session.precio,
      propertyRef: session.propertyRef,
      agenteName,
      fechaVisita,
      horaVisita,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[parte-visita] Error sending Flow to ${session.buyerPhone}: ${message}`,
    );
    return { success: false, error: message };
  }

  await prisma.parteVisitaSession.update({
    where: { id: sessionId },
    data: { state: "FORMULARIO_ENVIADO" },
  });

  console.log(
    `[parte-visita] Flow sent to buyer ${session.buyerPhone} — session=${sessionId}`,
  );

  return { success: true };
}
