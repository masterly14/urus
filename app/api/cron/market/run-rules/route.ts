/**
 * POST /api/cron/market/run-rules (cada 10 min)
 *
 * Esqueleto no-op. En MVP no hay reglas de negocio configuradas; este
 * endpoint queda cableado para activarlas en V2 sin mover infra.
 *
 * Cuando se implementen reglas (alta nueva en zona, bajada relevante,
 * reactivacion, anuncios de particular en cobertura) este handler
 * encolara MARKET_RUN_RULES por cada regla activa.
 */

import { NextResponse } from "next/server";
import { isQstashAuthorized } from "@/lib/api/cron-auth";
import { withObservedRoute } from "@/lib/observability";

const postHandler = async (request: Request) => {
  if (!(await isQstashAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    skipped: true,
    reason: "no rules configured (V2 placeholder)",
  });
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/cron/market/run-rules" },
  postHandler,
);

export const maxDuration = 30;
