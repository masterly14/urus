/**
 * POST /api/cron/market/refresh-snapshot (cada 30 min)
 *
 * Encola MARKET_REFRESH_SNAPSHOT por cada ciudad activa. El handler corre
 * dentro del consumer generico via /api/cron/consumer.
 */

import { NextResponse } from "next/server";
import { isQstashAuthorized } from "@/lib/api/cron-auth";
import { withObservedRoute } from "@/lib/observability";
import { enqueueRefreshSnapshot } from "@/lib/market/scheduler";

const postHandler = async (request: Request) => {
  if (!(await isQstashAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (process.env.MARKET_FEATURE_ENABLED === "false") {
    return NextResponse.json({ skipped: true, reason: "MARKET_FEATURE_ENABLED=false" });
  }

  try {
    const result = await enqueueRefreshSnapshot();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cron/market/refresh-snapshot] error: ${message}`);
    return NextResponse.json({
      skipped: true,
      reason: "enqueueRefreshSnapshot threw",
      error: message,
    });
  }
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/cron/market/refresh-snapshot" },
  postHandler,
);

export const maxDuration = 60;
