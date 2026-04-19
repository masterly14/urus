import { NextResponse } from "next/server";
import { withObservedRoute } from "@/lib/observability";
import {
  forbidden,
  getSessionFromRequest,
  isCeoOrAdmin,
  unauthorized,
} from "@/lib/auth/session";
import { getWorkersStatusFull } from "@/lib/workers/status";

const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return unauthorized();
  }
  if (!isCeoOrAdmin(session.role)) {
    return forbidden();
  }

  try {
    const data = await getWorkersStatusFull();
    return NextResponse.json({ ok: true, ...data });
  } catch (err) {
    console.error(
      "[GET /api/configuracion/health]",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "Error al obtener el panel de health" },
      { status: 500 },
    );
  }
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/configuracion/health" },
  getHandler,
);
