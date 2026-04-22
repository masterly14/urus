import { NextResponse } from "next/server";
import {
  getSessionFromRequest,
  isCeoOrAdmin,
  unauthorized,
  forbidden,
} from "@/lib/auth/session";
import { getCachedCeoOverview } from "@/lib/dashboard/ceo/cached-queries";
import { withObservedRoute } from "@/lib/observability";


const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

  try {
    const data = await getCachedCeoOverview();
    return NextResponse.json({ ok: true, ...data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/ceo/overview] Error:", message);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}

export const GET = withObservedRoute({ method: "GET", route: "/api/ceo/overview" }, getHandler);
