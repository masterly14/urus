import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/api/cron-auth";
import { runRecalibration } from "@/lib/scoring/recalibration";
import { withObservedRoute } from "@/lib/observability";


/**
 * POST /api/scoring/recalibrate
 *
 * Trigger manual de recalibración de pesos del scoring.
 * Query param ?activate=true para forzar activación aunque no mejore el backtest.
 */
const postHandler = async (request: Request) => {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const forceActivate = url.searchParams.get("activate") === "true";

  try {
    const result = await runRecalibration(forceActivate);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[api/scoring/recalibrate] Error: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withObservedRoute({ method: "POST", route: "/api/scoring/recalibrate" }, postHandler);

export const maxDuration = 60;
