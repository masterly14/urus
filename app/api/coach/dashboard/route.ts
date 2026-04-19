import { NextResponse } from "next/server";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { getCoachDashboardData } from "@/lib/dashboard/mental-health/queries";
import { withObservedRoute } from "@/lib/observability";

/**
 * GET /api/coach/dashboard
 *
 * Devuelve datos completos para la UI del Coach Emocional:
 * - overview: métricas agregadas (sesiones, energía, flujos, alertas)
 * - comerciales: stats per-comercial (sesiones, energía, estrés)
 * - weeklyUsage: sesiones por día de la semana
 */
const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return unauthorized();
  }

  try {
    const data = await getCoachDashboardData();
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error(
      "[api/coach/dashboard] Error:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "Error al obtener datos del Coach" },
      { status: 500 },
    );
  }
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/coach/dashboard" },
  getHandler,
);
