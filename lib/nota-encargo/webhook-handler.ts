/**
 * Webhook handler for the Nota de Encargo flow.
 *
 * Procesa `nfm_reply` del WhatsApp Flow completado por el comercial.
 */

import { prisma } from "@/lib/prisma";
import { handleNotaEncargoFlowResponse } from "./send-to-signature";
import { resolveComercial } from "@/lib/routing/resolve-comercial";
import {
  normalizeComercialWhatsappPhone,
  samePhoneByLast9,
} from "@/lib/routing/comercial-whatsapp";

export async function handleNotaEncargoNfmReply(
  from: string,
  responseJson: string,
): Promise<boolean> {
  let responseData: Record<string, unknown>;
  try {
    responseData = JSON.parse(responseJson);
  } catch {
    console.error("[nota-encargo-webhook] Failed to parse nfm_reply JSON");
    return false;
  }

  const flowToken = responseData.flow_token as string | undefined;
  if (!flowToken) return false;

  const session = await prisma.notaEncargoSession.findUnique({
    where: { id: flowToken },
  });

  if (!session) return false;
  if (session.state !== "FORMULARIO_ENVIADO") {
    console.log(
      `[nota-encargo-webhook] Session ${session.id} not in FORMULARIO_ENVIADO state (${session.state}) — ignoring`,
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
      `[nota-encargo-webhook] Ignoring nfm_reply for session ${session.id}: from ${from} does not match comercial`,
    );
    return false;
  }

  console.log(
    `[nota-encargo-webhook] Processing Flow response for session ${session.id}`,
  );

  await handleNotaEncargoFlowResponse(session, responseData);

  return true;
}
