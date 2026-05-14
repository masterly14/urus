/**
 * POST /api/cron/market/run-rules (cada 10 min)
 *
 * Evaluador de alertas guardadas (`MarketSavedAlert`). Para cada alerta
 * activa cuya `lastEvaluatedAt` haya superado el intervalo de su `frequency`,
 * busca matches nuevos (MarketEvent CREATED/PRICE_CHANGED/REACTIVATED desde
 * la ultima evaluacion) y entrega por los canales configurados:
 *   - in_app: persiste Notification y dispara Pusher al canal del usuario.
 *   - whatsapp: envia plantilla `WHATSAPP_TEMPLATE_MARKET_ALERT` al telefono
 *     del comercial con un resumen agregado (max 5 matches por mensaje).
 *
 * Idempotencia: cada delivery se persiste en MarketAlertDelivery con
 * `dedupeKey = sha256(alertId|listingId|channel|day)` unique.
 *
 * Si MARKET_FEATURE_ENABLED=false, no hace nada y devuelve { skipped: true }.
 */

import { NextResponse } from "next/server";
import { isQstashAuthorized } from "@/lib/api/cron-auth";
import { withObservedRoute } from "@/lib/observability";
import { evaluateAllDueAlerts } from "@/lib/market/alerts";

const postHandler = async (request: Request) => {
  if (!(await isQstashAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (process.env.MARKET_FEATURE_ENABLED === "false") {
    return NextResponse.json({
      skipped: true,
      reason: "MARKET_FEATURE_ENABLED=false",
    });
  }

  try {
    const result = await evaluateAllDueAlerts();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cron/market/run-rules] error: ${message}`);
    return NextResponse.json({
      skipped: true,
      reason: "evaluator threw",
      error: message,
    });
  }
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/cron/market/run-rules" },
  postHandler,
);

export const maxDuration = 120;
