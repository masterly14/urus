/**
 * POST /api/cron/market/health-check (cada 5 min)
 *
 * Calcula metricas operativas y las emite a logs estructurados (en MVP
 * no se persisten; quedan en logs Vercel/Railway). Ver
 * `lib/market/scheduler.ts → collectHealthSnapshot`.
 *
 * En V2 se persistira en una tabla MarketHealthHistory para graficar
 * frescura/cobertura por dia.
 */

import { NextResponse } from "next/server";
import { isQstashAuthorized } from "@/lib/api/cron-auth";
import { withObservedRoute } from "@/lib/observability";
import { collectHealthSnapshot } from "@/lib/market/scheduler";

const postHandler = async (request: Request) => {
  if (!(await isQstashAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const snapshot = await collectHealthSnapshot();
    console.log(
      `[cron/market/health-check] worker=${snapshot.workerStatus} portals=${snapshot.perPortal
        .map(
          (p) =>
            `${p.source}:${p.breakerStatus}:${p.activeListings}:${p.freshnessSeconds ?? "-"}s`,
        )
        .join(" ")}`,
    );
    return NextResponse.json({ ok: true, ...snapshot });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cron/market/health-check] error: ${message}`);
    return NextResponse.json({
      skipped: true,
      reason: "collectHealthSnapshot threw",
      error: message,
    });
  }
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/cron/market/health-check" },
  postHandler,
);

export const maxDuration = 30;
