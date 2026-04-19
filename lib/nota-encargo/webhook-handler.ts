/**
 * Webhook handlers for the Nota de Encargo flow.
 *
 * Handles two types of incoming messages:
 * 1. Button replies from the reminder (confirmo / no puedo)
 * 2. nfm_reply from the WhatsApp Flow (form submission)
 */

import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store";
import { enqueueJob } from "@/lib/job-queue";
import { handleNotaEncargoFlowResponse } from "./send-to-signature";

// ---------------------------------------------------------------------------
// Button reply handler (recordatorio confirmation)
// ---------------------------------------------------------------------------

export async function handleNotaEncargoButtonReply(
  from: string,
  buttonId: string,
): Promise<boolean> {
  if (
    buttonId !== "nota_encargo_confirmo" &&
    buttonId !== "nota_encargo_no_puedo"
  ) {
    return false;
  }

  const session = await prisma.notaEncargoSession.findFirst({
    where: { propietarioPhone: from, state: "RECORDATORIO_ENVIADO" },
    orderBy: { visitDateTime: "asc" },
  });

  if (!session) return false;

  if (buttonId === "nota_encargo_confirmo") {
    await prisma.notaEncargoSession.update({
      where: { id: session.id },
      data: { state: "CONFIRMADA" },
    });

    await enqueueJob({
      type: "NOTA_ENCARGO_ENVIAR_FORMULARIO",
      payload: { sessionId: session.id },
      availableAt: session.visitDateTime,
      idempotencyKey: `nota_encargo_formulario:${session.id}`,
    });

    await appendEvent({
      type: "NOTA_ENCARGO_CONFIRMADA",
      aggregateType: "PROPERTY",
      aggregateId: session.propertyCode,
      payload: { sessionId: session.id },
    });

    console.log(
      `[nota-encargo-webhook] Owner confirmed visit for session ${session.id}`,
    );
  } else {
    console.log(
      `[nota-encargo-webhook] Owner declined visit for session ${session.id} — check job will handle`,
    );
  }

  return true;
}

// ---------------------------------------------------------------------------
// nfm_reply handler (WhatsApp Flow form completion)
// ---------------------------------------------------------------------------

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

  console.log(
    `[nota-encargo-webhook] Processing Flow response for session ${session.id}`,
  );

  await handleNotaEncargoFlowResponse(session, responseData);

  return true;
}
