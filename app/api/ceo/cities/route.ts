import { NextResponse } from "next/server";
import {
  getSessionFromRequest,
  isCeoOrAdmin,
  unauthorized,
  forbidden,
} from "@/lib/auth/session";
import { getCeoCityPerformance } from "@/lib/dashboard/ceo/city-queries";
import { withObservedRoute } from "@/lib/observability";


const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

  try {
    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    const range =
      fromParam && toParam
        ? { from: new Date(fromParam), to: new Date(toParam) }
        : undefined;

    const data = await getCeoCityPerformance(range);
    return NextResponse.json({ ok: true, ...data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/ceo/cities] Error:", message);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}

export const GET = withObservedRoute({ method: "GET", route: "/api/ceo/cities" }, getHandler);
