/**
 * Webhook handler for the Parte de Visita flow.
 *
 * Handles nfm_reply from the WhatsApp Flow (form submission).
 * No button_reply handler needed since there's no reminder/confirmation step.
 */

import { prisma } from "@/lib/prisma";
import { handleParteVisitaFlowResponse } from "./send-to-signature";
import { completeVisit } from "@/lib/visit-scheduling/session-manager";
import { sendParteVisitaFlow } from "./whatsapp";
import { resolveParteVisitaBuyerName } from "./resolve-buyer-name";
import { resolveComercial } from "@/lib/routing/resolve-comercial";
import {
  findComercialByIncomingWaId,
  normalizeComercialWhatsappPhone,
  samePhoneByLast9,
} from "@/lib/routing/comercial-whatsapp";

export async function handleParteVisitaNfmReply(
  from: string,
  responseJson: string,
): Promise<boolean> {
  let responseData: Record<string, unknown>;
  try {
    responseData = JSON.parse(responseJson);
  } catch {
    console.error("[parte-visita-webhook] Failed to parse nfm_reply JSON");
    return false;
  }

  const flowToken = responseData.flow_token as string | undefined;
  if (!flowToken) return false;

  const session = await prisma.parteVisitaSession.findUnique({
    where: { id: flowToken },
  });

  if (!session) return false;
  if (session.state !== "FORMULARIO_ENVIADO") {
    console.log(
      `[parte-visita-webhook] Session ${session.id} not in FORMULARIO_ENVIADO state (${session.state}) — ignoring`,
    );
    return false;
  }

  const comercial = await resolveComercial({
    comercialId: session.comercialId,
    requireActive: false,
  });
  const comercialPhone = normalizeComercialWhatsappPhone(comercial);
  if (!samePhoneByLast9(from, comercialPhone)) {
    console.log(
      `[parte-visita-webhook] Ignoring nfm_reply for session ${session.id}: from ${from} does not match comercial`,
    );
    return false;
  }

  console.log(
    `[parte-visita-webhook] Processing Flow response for session ${session.id}`,
  );

  await handleParteVisitaFlowResponse(session, responseData);

  if (session.visitSessionId) {
    try {
      await completeVisit(session.visitSessionId);
    } catch (err) {
      console.warn(
        `[parte-visita-webhook] No se pudo transicionar sesión ${session.visitSessionId} a VISIT_COMPLETED:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return true;
}

/**
 * Mitigación: si el comprador envía un mensaje fuera del Flow (audio/texto)
 * y la sesión sigue en FORMULARIO_ENVIADO, reenviamos el Flow para guiarlo.
 */
export async function handleParteVisitaOffFlowMessage(
  from: string,
): Promise<boolean> {
  const resendCooldownMs = 2 * 60 * 1000;
  const recentFlow = await prisma.event.findFirst({
    where: {
      type: "WHATSAPP_ENVIADO",
      aggregateType: "WHATSAPP_CONVERSATION",
      aggregateId: from,
      payload: { path: ["kind"], equals: "parte_visita_formulario_flow" },
      occurredAt: { gte: new Date(Date.now() - resendCooldownMs) },
    },
    select: { id: true, occurredAt: true },
    orderBy: { occurredAt: "desc" },
  });
  if (recentFlow) {
    return false;
  }

  const senderComercial = await findComercialByIncomingWaId(from);
  if (!senderComercial) return false;

  const session = await prisma.parteVisitaSession.findFirst({
    where: { comercialId: senderComercial.id, state: "FORMULARIO_ENVIADO" },
    orderBy: { updatedAt: "desc" },
  });
  if (!session) return false;

  const sessionComercial = await resolveComercial({
    comercialId: session.comercialId,
    requireActive: false,
  });
  const agenteName = sessionComercial?.nombre ?? "URUS Capital Group";
  const fechaVisita = session.visitDateTime.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const horaVisita = session.visitDateTime.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const buyerName = await resolveParteVisitaBuyerName({
    buyerPhone: session.buyerPhone,
    sessionBuyerName: session.buyerNombre,
    draftDemandId: session.draftDemandId,
  });

  try {
    const comercialPhone = normalizeComercialWhatsappPhone(sessionComercial);
    if (!comercialPhone) return false;
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
    console.log(
      `[parte-visita-webhook] Off-flow message from comercial ${from}. Flow resent for session ${session.id}`,
    );
  } catch (err) {
    console.warn(
      `[parte-visita-webhook] Could not resend flow for ${from}:`,
      err instanceof Error ? err.message : err,
    );
  }

  return true;
}
