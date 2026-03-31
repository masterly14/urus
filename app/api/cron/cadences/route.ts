import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/api/cron-auth";
import { scanAndEnqueueMissingFollowUps } from "@/lib/leads/cadence-scanner";
import { scanAndEnqueueMissingPostSaleJobs } from "@/lib/post-sale/cadence-scanner";

/**
 * Cron de cadencias automáticas.
 * Ejecutar cada 6–12h (Upstash QStash schedule).
 *
 * 1. Leads: revisa leads sin respuesta y encola follow-ups faltantes.
 * 2. Post-venta: revisa operaciones cerradas y encola cadencias M9 faltantes.
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [leadResult, postSaleResult] = await Promise.all([
      scanAndEnqueueMissingFollowUps(),
      scanAndEnqueueMissingPostSaleJobs(),
    ]);

    console.log(
      `[cron/cadences] leads=${leadResult.leadsScanned} encolados=${leadResult.followUpsEnqueued} cubiertos=${leadResult.leadsAlreadyCovered}`,
    );
    console.log(
      `[cron/cadences] post-venta ops=${postSaleResult.operationsScanned} encolados=${postSaleResult.jobsEnqueued} cubiertos=${postSaleResult.operationsAlreadyCovered}`,
    );

    return NextResponse.json({ leads: leadResult, postSale: postSaleResult });
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
