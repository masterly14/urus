/**
 * GET /api/matching/rematch/active
 *
 * Devuelve el runId del rematch actualmente en curso (si existe).
 * Se usa en la UI para reanudar el polling al cargar la página.
 * Solo CEO.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { failStaleRematchRunIfNeeded } from "@/lib/matching/rematch-stale";
import { withObservedRoute } from "@/lib/observability";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";

const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (session.role !== "ceo") {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const running = await prisma.rematchRun.findFirst({
    where: { status: "RUNNING" },
    select: {
      id: true,
      status: true,
      demandsProcessed: true,
      startedAt: true,
    },
    orderBy: { startedAt: "desc" },
  });

  if (!running) {
    return NextResponse.json({ runId: null });
  }

  if (await failStaleRematchRunIfNeeded(running)) {
    return NextResponse.json({ runId: null });
  }

  return NextResponse.json({ runId: running.id });
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/matching/rematch/active" },
  getHandler,
);
