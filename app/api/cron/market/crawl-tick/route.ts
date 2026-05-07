/**
 * POST /api/cron/market/crawl-tick (cada 5 min)
 *
 * Drena un batch de jobs MARKET_CRAWL_SEED y los delega al Market Worker.
 * Persiste el resultado y actualiza circuit breakers cuando corresponda.
 *
 * Es independiente de /api/cron/consumer porque MARKET_CRAWL_SEED necesita
 * un timeout largo y un cliente HTTP dedicado al Worker.
 */

import { NextResponse } from "next/server";
import { isQstashAuthorized } from "@/lib/api/cron-auth";
import { withObservedRoute } from "@/lib/observability";
import { runCrawlTick } from "@/lib/market/scheduler";

const postHandler = async (request: Request) => {
  if (!(await isQstashAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (process.env.MARKET_FEATURE_ENABLED === "false") {
    return NextResponse.json({ skipped: true, reason: "MARKET_FEATURE_ENABLED=false" });
  }

  let batchSize: number | undefined;
  try {
    const body = (await request.json().catch(() => ({}))) as { batchSize?: number };
    if (typeof body.batchSize === "number") batchSize = body.batchSize;
  } catch {
    // body vacio
  }

  try {
    const result = await runCrawlTick({ batchSize });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cron/market/crawl-tick] error: ${message}`);
    return NextResponse.json({
      skipped: true,
      reason: "runCrawlTick threw",
      error: message,
    });
  }
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/cron/market/crawl-tick" },
  postHandler,
);

// Vercel Pro: 300s. Cada llamada al Worker puede tardar ~10-30s; con
// batchSize=5 cabemos sobrado.
export const maxDuration = 300;
