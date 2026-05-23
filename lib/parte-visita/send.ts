/**
 * Envío síncrono del Parte de Visita.
 *
 * Función reutilizable, ejecutada en caliente desde el endpoint
 * `/api/parte-visita/send` (QStash callback en el instante de la visita) y,
 * como red de seguridad, desde el cron `/api/cron/parte-visita-rescate` y el
 * script de rescate manual.
 *
 * Es idempotente y safe a la concurrencia:
 *   - Si la sesión no está en `PENDING`, no reenvía (skip).
 *   - Si dos llamadas entran en paralelo (p. ej. QStash retry + cron rescate),
 *     solo una completa el envío. La otra detecta el cambio de estado y
 *     devuelve `already_sent` sin reenviar.
 *
 * Protocolo de claim (lock optimista):
 *   1. Se envía la plantilla de contexto al comercial. Esta operación es
 *      idempotente desde el punto de vista de WhatsApp: enviar dos veces el
 *      mismo template es molesto pero no daña; lo aceptamos como riesgo
 *      reducido frente al riesgo mayor de no enviar nunca.
 *   2. ANTES del envío del Flow (el mensaje crítico que abre el formulario),
 *      hacemos un `updateMany` condicional `PENDING -> FORMULARIO_ENVIADO`.
 *      Solo el primer caller obtiene `count=1` y prosigue. Los demás
 *      detectan `count=0` y abortan limpiamente.
 *   3. Si el envío del Flow falla, revertimos `FORMULARIO_ENVIADO -> PENDING`
 *      (rollback condicional) para que el cron de rescate pueda reintentarlo.
 */

import { prisma } from "@/lib/prisma";
import { resolveComercial } from "@/lib/routing/resolve-comercial";
import { normalizeComercialWhatsappPhone } from "@/lib/routing/comercial-whatsapp";
import {
  sendParteVisitaContexto,
  sendParteVisitaFlow,
} from "@/lib/parte-visita/whatsapp";
import { resolveParteVisitaBuyerName } from "@/lib/parte-visita/resolve-buyer-name";

export type SendParteVisitaResult =
  | { ok: true; status: "sent" | "already_sent" | "not_pending"; sessionState?: string }
  | { ok: false; permanent: boolean; error: string };

const INACTIVE_VISIT_STATES = new Set(["VISIT_CANCELLED", "VISIT_RESCHEDULED"]);

async function abortIfVisitNoLongerActive(session: {
  id: string;
  visitSessionId: string;
}): Promise<SendParteVisitaResult | null> {
  const visitSession = await prisma.visitSchedulingSession.findUnique({
    where: { id: session.visitSessionId },
    select: { state: true },
  });

  if (!visitSession || !INACTIVE_VISIT_STATES.has(visitSession.state)) {
    return null;
  }

  await prisma.parteVisitaSession.updateMany({
    where: { id: session.id, state: { in: ["PENDING", "FORMULARIO_ENVIADO"] } },
    data: { state: "CANCELADA" },
  });

  console.log(
    `[parte-visita] Visit session ${session.visitSessionId} is ${visitSession.state}; cancelling parte session ${session.id} before send`,
  );
  return { ok: true, status: "not_pending", sessionState: "CANCELADA" };
}

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

  const inactiveVisitResult = await abortIfVisitNoLongerActive(session);
  if (inactiveVisitResult) return inactiveVisitResult;

  const comercial = await resolveComercial({
    comercialId: session.comercialId,
    requireActive: false,
  });
  const agenteName = comercial?.nombre ?? "URUS Capital Group";
  const comercialPhone = normalizeComercialWhatsappPhone(comercial);
  if (!comercialPhone) {
    return {
      ok: false,
      permanent: true,
      error: `Comercial ${session.comercialId} sin teléfono WhatsApp para enviar parte de visita`,
    };
  }

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
    await sendParteVisitaContexto(comercialPhone, {
      sessionId: session.id,
      propertyRef: session.propertyRef,
      propertyTitle,
      propertyUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[parte-visita] Error enviando contexto a ${comercialPhone} (session=${sessionId}): ${message}`,
    );
    return { ok: false, permanent: false, error: `contexto: ${message}` };
  }

  // ────────────────────────────────────────────────────────────────────────
  // Claim atómico antes del envío del Flow.
  // Si otro proceso (QStash retry, cron rescate, script manual) ya transicionó
  // PENDING → FORMULARIO_ENVIADO, `count` será 0 y abortamos sin reenviar.
  // ────────────────────────────────────────────────────────────────────────
  const claim = await prisma.parteVisitaSession.updateMany({
    where: { id: sessionId, state: "PENDING" },
    data: { state: "FORMULARIO_ENVIADO" },
  });
  if (claim.count === 0) {
    const fresh = await prisma.parteVisitaSession.findUnique({
      where: { id: sessionId },
      select: { state: true },
    });
    console.log(
      `[parte-visita] Race condition detectada en session=${sessionId}: otro proceso ya transicionó a ${fresh?.state ?? "?"}. Saltando envío del Flow.`,
    );
    return {
      ok: true,
      status: fresh?.state === "FORMULARIO_ENVIADO" ? "already_sent" : "not_pending",
      sessionState: fresh?.state,
    };
  }

  const inactiveVisitAfterClaim = await abortIfVisitNoLongerActive(session);
  if (inactiveVisitAfterClaim) return inactiveVisitAfterClaim;

  try {
    await sendParteVisitaFlow(comercialPhone, {
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
      `[parte-visita] Error enviando Flow a ${comercialPhone} (session=${sessionId}): ${message}`,
    );
    // Rollback condicional: solo si el state sigue siendo FORMULARIO_ENVIADO
    // (no se ha avanzado por una respuesta del comercial que nunca llegó
    // porque el envío falló).
    await prisma.parteVisitaSession.updateMany({
      where: { id: sessionId, state: "FORMULARIO_ENVIADO" },
      data: { state: "PENDING" },
    });
    return { ok: false, permanent: false, error: `flow: ${message}` };
  }

  console.log(
    `[parte-visita] Flow sent to comercial ${comercialPhone} — session=${sessionId}`,
  );

  return { ok: true, status: "sent" };
}
