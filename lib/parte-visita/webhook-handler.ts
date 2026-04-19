/**
 * Webhook handler for the Parte de Visita flow.
 *
 * Handles nfm_reply from the WhatsApp Flow (form submission).
 * No button_reply handler needed since there's no reminder/confirmation step.
 */

import { prisma } from "@/lib/prisma";
import { handleParteVisitaFlowResponse } from "./send-to-signature";
import { completeVisit } from "@/lib/visit-scheduling/session-manager";

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
