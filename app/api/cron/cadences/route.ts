import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/api/cron-auth";
import { scanAndEnqueueMissingFollowUps } from "@/lib/leads/cadence-scanner";

/**
 * Cron de cadencias automáticas.
 * Ejecutar cada 6–12h (Upstash QStash schedule).
 *
 * Revisa leads sin respuesta (sin evento LEAD_CONTACTADO) que no tengan
 * jobs FOLLOW_UP_LEAD pendientes y encola los que falten como red de seguridad.
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await scanAndEnqueueMissingFollowUps();

    console.log(
      `[cron/cadences] leads=${result.leadsScanned} encolados=${result.followUpsEnqueued} cubiertos=${result.leadsAlreadyCovered}`,
    );

    return NextResponse.json(result);
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

export const maxDuration = 60;
