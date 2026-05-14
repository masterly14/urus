/**
 * Envío síncrono del Parte de Visita.
 *
 * Función reutilizable, ejecutada en caliente desde el endpoint
 * `/api/parte-visita/send` (QStash callback en el instante de la visita) y,
 * como red de seguridad, desde el job handler legacy y el script de rescate.
 *
 * Es idempotente: si la sesión no está en `PENDING`, no reenvía.
 */

import { prisma } from "@/lib/prisma";
import { resolveComercial } from "@/lib/routing/resolve-comercial";
import {
  sendParteVisitaContexto,
  sendParteVisitaFlow,
} from "@/lib/parte-visita/whatsapp";
import { resolveParteVisitaBuyerName } from "@/lib/parte-visita/resolve-buyer-name";

export type SendParteVisitaResult =
  | { ok: true; status: "sent" | "already_sent" | "not_pending"; sessionState?: string }
  | { ok: false; permanent: boolean; error: string };

export async function sendParteVisitaForSession(
  sessionId: string,
): Promise<SendParteVisitaResult> {
  if (!sessionId) {
    return { ok: false, permanent: true, error: "sessionId vacío" };
  }

  const session = await prisma.parteVisitaSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    return {
      ok: false,
      permanent: true,
      error: `ParteVisitaSession ${sessionId} no encontrada`,
    };
  }

  if (session.state !== "PENDING") {
    console.log(
      `[parte-visita] Session ${sessionId} not in PENDING state (${session.state}) — skipping`,
    );
    return {
      ok: true,
      status: session.state === "FORMULARIO_ENVIADO" ? "already_sent" : "not_pending",
      sessionState: session.state,
    };
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

  const property = await prisma.propertyCurrent.findUnique({
    where: { codigo: session.propertyCode },
    select: { titulo: true, portalUrl: true },
  });
  const propertyTitle =
    property?.titulo?.trim() ||
    session.direccion ||
    session.propertyRef ||
    "propiedad";
  const propertyUrl =
    property?.portalUrl?.trim() ||
    // Fallback cuando aún no hay portalUrl sincronizado.
    "https://www.idealista.com/";
  const buyerName = await resolveParteVisitaBuyerName({
    buyerPhone: session.buyerPhone,
    sessionBuyerName: session.buyerNombre,
    draftDemandId: session.draftDemandId,
  });

  try {
    await sendParteVisitaContexto(session.buyerPhone, {
      sessionId: session.id,
      propertyRef: session.propertyRef,
      propertyTitle,
      propertyUrl,
    });
    await sendParteVisitaFlow(session.buyerPhone, {
      sessionId: session.id,
      buyerName,
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
    return { ok: false, permanent: false, error: message };
  }

  await prisma.parteVisitaSession.update({
    where: { id: sessionId },
    data: { state: "FORMULARIO_ENVIADO" },
  });

  console.log(
    `[parte-visita] Flow sent to buyer ${session.buyerPhone} — session=${sessionId}`,
  );

  return { ok: true, status: "sent" };
}
