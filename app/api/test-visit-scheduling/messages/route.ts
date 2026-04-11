/**
 * GET /api/test-visit-scheduling/messages?sessionId=xxx
 *
 * Devuelve los mensajes capturados de una sesión, incluyendo metadatos
 * para que la UI sepa qué panel (buyer/commercial) corresponde a cada uno.
 */

import { NextResponse } from "next/server";
import {
  getMessagesForSession,
  getSessionMeta,
} from "@/lib/visit-scheduling/test-message-store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json(
      { error: "Se requiere sessionId" },
      { status: 400 },
    );
  }

  const messages = getMessagesForSession(sessionId);
  const meta = getSessionMeta(sessionId);

  return NextResponse.json({ messages, meta });
}
