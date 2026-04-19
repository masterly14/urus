import { NextResponse } from "next/server";
import { isQstashAuthorized } from "@/lib/api/cron-auth";
import { rearmPostventaAnnualJobs } from "@/lib/postventa/rearm-scanner";
import { withObservedRoute } from "@/lib/observability";

/**
 * Cron de red de seguridad para cadencias anuales post-venta (M9).
 * Ejecutar 1×/mes (Upstash QStash schedule).
 *
 * Recorre `PostventaSurveySession` completadas y asegura que hay un job
 * encolado para el próximo cumpleaños y la próxima Navidad de cada cliente.
 * Idempotente por idempotencyKey anual.
 */
const postHandler = async (request: Request) => {
  if (!(await isQstashAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await rearmPostventaAnnualJobs();
    console.log(
      `[cron/postventa-rearm] sessions=${result.sessionsScanned} cumple+=${result.birthdayEnqueued} navidad+=${result.navidadEnqueued} cubiertos=${result.alreadyCovered}`,
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error(
      "[cron/postventa-rearm] Error:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "Error al rearmar cadencias anuales post-venta" },
      { status: 500 },
    );
  }
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/cron/postventa-rearm" },
  postHandler,
);

export const maxDuration = 60;
