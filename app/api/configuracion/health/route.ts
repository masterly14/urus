import { NextResponse } from "next/server";
import { withObservedRoute } from "@/lib/observability";
import { getSession } from "@/lib/auth/session";
import { getWorkersStatusFull } from "@/lib/workers/status";

const getHandler = async (request: Request) => {
  const session = getSession(request);

  if (session.role !== "ceo") {
    return NextResponse.json(
      { error: "Acceso restringido al CEO" },
      { status: 403 },
    );
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
