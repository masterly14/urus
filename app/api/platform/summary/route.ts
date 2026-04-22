import { NextResponse } from "next/server";
import { withObservedRoute } from "@/lib/observability";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { getCachedPlatformSummary } from "@/lib/platform/queries";

const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  try {
    const data = await getCachedPlatformSummary();
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[api/platform/summary] Error:", message);
    return NextResponse.json(
      { error: "Error al construir el resumen de plataforma" },
      { status: 500 },
    );
  }
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/platform/summary" },
  getHandler,
);
