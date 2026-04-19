import { NextResponse } from "next/server";
import { isQstashAuthorized } from "@/lib/api/cron-auth";
import { scanAndEnqueueMissingFollowUps } from "@/lib/leads/cadence-scanner";
import { withObservedRoute } from "@/lib/observability";


/**
 * Cron de cadencias automáticas.
 * Ejecutar cada 6–12h (Upstash QStash schedule).
 *
 * 1. Leads: revisa leads sin respuesta y encola follow-ups faltantes.
 * 2. (Deprecated 2026-04-17) Post-venta `post-sale` legacy — la red de seguridad
 *    canónica vive ahora en `/api/cron/postventa-cadences` (usa
 *    `lib/postventa/cadence-scanner`). No se invoca aquí para no duplicar envíos.
 */
const postHandler = async (request: Request) => {
  if (!(await isQstashAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const leadResult = await scanAndEnqueueMissingFollowUps();

    console.log(
      `[cron/cadences] leads=${leadResult.leadsScanned} encolados=${leadResult.followUpsEnqueued} cubiertos=${leadResult.leadsAlreadyCovered}`,
    );

    return NextResponse.json({ leads: leadResult });
  } catch (err) {
    console.error(
      "[cron/cadences] Error:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "Error al escanear cadencias" },
      { status: 500 },
    );
  }
}

export const POST = withObservedRoute({ method: "POST", route: "/api/cron/cadences" }, postHandler);

export const maxDuration = 60;
