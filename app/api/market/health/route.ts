/**
 * GET /api/market/health
 *
 * Devuelve estado consolidado del Core de Mercado:
 *   - Status del Worker (ok / degraded / unreachable / unconfigured).
 *   - Por portal: breaker, ultimo crawl, listings activos, frescura del snapshot.
 *
 * Acceso: roles `admin` y `ceo`. El cron `/api/cron/market/health-check`
 * usa la misma fuente (`collectHealthSnapshot`).
 */

import { NextResponse } from "next/server";
import { getSession, forbidden, unauthorized, isCeoOrAdmin } from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { collectHealthSnapshot } from "@/lib/market/scheduler";

const getHandler = async (_request: Request) => {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

  try {
    const snapshot = await collectHealthSnapshot();
    return NextResponse.json({ ok: true, ...snapshot });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/market/health" },
  getHandler,
);

export const dynamic = "force-dynamic";
