/**
 * GET /api/test-visit-scheduling/messages?sessionId=xxx
 *
 * Devuelve los mensajes capturados de una sesión, incluyendo metadatos
 * para que la UI sepa qué panel (buyer/commercial) corresponde a cada uno.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/auth/session";
import { canAccessTestVisitSession } from "@/lib/visit-scheduling/test-visit-session";
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

  const appSession = await getSessionFromRequest(request);
  if (!appSession) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const visitSession = await prisma.visitSchedulingSession.findUnique({
    where: { id: sessionId },
    select: { comercialId: true },
  });
  if (!visitSession) {
    return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });
  }
  if (!canAccessTestVisitSession(appSession, visitSession.comercialId)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const messages = getMessagesForSession(sessionId);
  const meta = getSessionMeta(sessionId);

  return NextResponse.json({ messages, meta });
}
