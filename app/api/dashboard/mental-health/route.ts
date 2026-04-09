import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getMentalHealthOverview } from "@/lib/dashboard/mental-health/queries";
import { withObservedRoute } from "@/lib/observability";


/**
 * GET /api/dashboard/mental-health
 *
 * Devuelve métricas agregadas de uso del bot de soporte mental (Capa 5).
 * No expone conversaciones individuales ni contenido de sesiones.
 *
 * Requiere sesión autenticada.
 *
 * Respuesta:
 * {
 *   sesionesUltimos30d: number,
 *   comercialesActivos: number,
 *   energiaMediaEquipo: number | null,
 *   flujoDistribucion: { bloqueo, preparacion, descarga, enfoque, crecimiento },
 *   alertasActivas: { energy_drop, recurrent_block, overload }
 * }
 */
const getHandler = async (request: Request) => {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const overview = await getMentalHealthOverview();
    return NextResponse.json({ ok: true, data: overview });
  } catch (err) {
    console.error(
      "[api/dashboard/mental-health] Error:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "Error al obtener métricas de capital humano" },
      { status: 500 },
    );
  }
}

export const GET = withObservedRoute({ method: "GET", route: "/api/dashboard/mental-health" }, getHandler);
