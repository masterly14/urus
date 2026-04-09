import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getCeoOverview } from "@/lib/dashboard/ceo/queries";
import { withObservedRoute } from "@/lib/observability";


const getHandler = async (request: Request) => {
  const session = getSession(request);

  if (session.role !== "ceo") {
    return NextResponse.json(
      { error: "Acceso restringido al CEO" },
      { status: 403 },
    );
  }

  try {
    const data = await getCeoOverview();
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
