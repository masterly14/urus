import { NextResponse } from "next/server";
import { isQstashAuthorized } from "@/lib/api/cron-auth";
import { scanPostventaCadences } from "@/lib/postventa/cadence-scanner";
import { withObservedRoute } from "@/lib/observability";


/**
 * Cron de cadencias post-venta (M9).
 * Ejecutar cada 12h (Upstash QStash schedule).
 *
 * Red de seguridad: busca operaciones cerradas (Vendido/Alquilado) sin
 * todos los steps de la cadencia post-venta encolados y los crea.
 * Respeta pausas por incidencias abiertas.
 */
const postHandler = async (request: Request) => {
  if (!(await isQstashAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await scanPostventaCadences();

    console.log(
      `[cron/postventa-cadences] operaciones=${result.operationsScanned} encolados=${result.followUpsEnqueued} cubiertos=${result.operationsAlreadyCovered} pausados=${result.operationsPaused}`,
    );

    return NextResponse.json(result);
  } catch (err) {
    console.error(
      "[cron/postventa-cadences] Error:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "Error al escanear cadencias post-venta" },
      { status: 500 },
    );
  }
}

export const POST = withObservedRoute({ method: "POST", route: "/api/cron/postventa-cadences" }, postHandler);

export const maxDuration = 60;
