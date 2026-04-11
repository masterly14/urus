/**
 * Procesa una respuesta del usuario (buyer o commercial) desde la UI
 * simuladora de WhatsApp. Usa clasificación real (determinista para
 * botones, GPT-4o-mini para texto libre) y el pipeline real del
 * orquestador.
 */

import { NextResponse } from "next/server";
import { setTestSendInterceptor } from "@/lib/whatsapp/send";
import {
  captureOutboundRaw,
  captureInboundMessage,
  startCapture,
  stopCapture,
  discardCapture,
  getMessagesForSession,
} from "@/lib/visit-scheduling/test-message-store";
import { handleVisitMessage } from "@/lib/visit-scheduling/handle-visit-message";
import { getSessionById } from "@/lib/visit-scheduling/session-manager";
import {
  classifyButtonReply,
  classifyVisitIntent,
} from "@/lib/agents/visit-intent-classifier";
import type { VisitIntentClassification } from "@/lib/visit-scheduling/types";

export async function POST(request: Request) {
  const body = await request.json();
  const {
    sessionId,
    senderRole,
    text,
    buttonId,
  } = body as {
    sessionId: string;
    senderRole: "buyer" | "commercial";
    text?: string;
    buttonId?: string;
  };

  if (!sessionId || !senderRole) {
    return NextResponse.json(
      { error: "Se requiere sessionId y senderRole" },
      { status: 400 },
    );
  }

  if (!text && !buttonId) {
    return NextResponse.json(
      { error: "Se requiere text o buttonId" },
      { status: 400 },
    );
  }

  let session;
  try {
    session = await getSessionById(sessionId);
  } catch {
    return NextResponse.json(
      { error: "Sesión no encontrada" },
      { status: 404 },
    );
  }

  const senderWaId =
    senderRole === "buyer" ? session.buyerWaId : session.comercialWaId!;

  captureInboundMessage(
    sessionId,
    senderWaId,
    text ?? "",
    buttonId ?? undefined,
  );

  let intent: VisitIntentClassification;

  if (buttonId) {
    const buttonIntent = classifyButtonReply(buttonId);
    if (buttonIntent) {
      intent = buttonIntent;
    } else {
      intent = {
        intent: "AMBIGUO",
        confidence: 0.5,
      };
    }
  } else {
    intent = await classifyVisitIntent(text!, session.state);
  }

  startCapture();
  setTestSendInterceptor(captureOutboundRaw);

  try {
    const result = await handleVisitMessage(
      session,
      intent,
      buttonId ?? null,
      senderWaId,
    );

    const newMessages = stopCapture(sessionId);
    const updatedSession = await getSessionById(sessionId);

    return NextResponse.json({
      handled: result.handled,
      error: result.error,
      intent: intent.intent,
      confidence: intent.confidence,
      extractedData: {
        date: intent.extractedDate,
        time: intent.extractedTime,
        name: intent.extractedName,
        phone: intent.extractedPhone,
        count: intent.extractedCount,
      },
      session: serializeSession(updatedSession),
      messages: getMessagesForSession(sessionId),
      newMessages,
    });
  } catch (err) {
    discardCapture();
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[test-visit-scheduling/respond] Error:", err);

    let updatedSession;
    try {
      updatedSession = await getSessionById(sessionId);
    } catch {
      updatedSession = session;
    }

    return NextResponse.json({
      handled: false,
      error: msg,
      intent: intent.intent,
      session: serializeSession(updatedSession),
      messages: getMessagesForSession(sessionId),
    });
  } finally {
    setTestSendInterceptor(null);
  }
}

function serializeSession(session: Record<string, unknown>) {
  return JSON.parse(
    JSON.stringify(session, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  );
}
