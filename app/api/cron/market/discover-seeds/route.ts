/**
 * POST /api/cron/market/discover-seeds (cada 15 min)
 *
 * Selecciona MarketSeed vencidos por cadencia, crea MarketCrawlRun en
 * RUNNING y encola MARKET_CRAWL_SEED. Idempotente por window-bucket.
 *
 * Solo procesa sources en ACTIVE_SOURCES_V1 (Fotocasa + Pisos.com en MVP).
 */

import { NextResponse } from "next/server";
import { isQstashAuthorized } from "@/lib/api/cron-auth";
import { withObservedRoute } from "@/lib/observability";
import { discoverDueSeeds } from "@/lib/market/scheduler";

const postHandler = async (request: Request) => {
  if (!(await isQstashAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (process.env.MARKET_FEATURE_ENABLED === "false") {
    return NextResponse.json({ skipped: true, reason: "MARKET_FEATURE_ENABLED=false" });
  }

  let limit: number | undefined;
  try {
    const body = (await request.json().catch(() => ({}))) as { limit?: number };
    if (typeof body.limit === "number") limit = body.limit;
  } catch {
    // body vacio
  }

  try {
    const result = await discoverDueSeeds({ limit });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cron/market/discover-seeds] error: ${message}`);
    // 200 con skipped para que QStash no reintente errores transitorios
    return NextResponse.json({
      skipped: true,
      reason: "discoverDueSeeds threw",
      error: message,
    });
  }
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/cron/market/discover-seeds" },
  postHandler,
);

export const maxDuration = 60;
