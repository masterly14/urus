/**
 * POST /api/cron/market/brightdata-success-rate (cadencia diaria — 06:00 UTC)
 *
 * Consulta el success rate de los ultimos 7 dias del Web Unlocker contra
 * `idealista.com` y lo persiste como `MarketEvent type=MARKET_BRIGHTDATA_HEALTH`.
 * Si el rate cae por debajo del umbral, loguea WARN para alerta externa
 * (Slack/email se conecta a partir de logs en V2).
 *
 * Endpoint Bright Data:
 *   GET https://api.brightdata.com/unblocker/success_rate/idealista.com
 *   Authorization: Bearer ${BRIGHTDATA_API_TOKEN}
 *
 * Respuesta esperada: { "idealista.com": 0.9835... }
 *
 * Si MARKET_IDEALISTA_ENABLED=false, hace no-op (devuelve { skipped: true }).
 *
 * Ver decisiones.md §11.5 (observabilidad y guardrails).
 */

import { NextResponse } from "next/server";
import { isQstashAuthorized } from "@/lib/api/cron-auth";
import { withObservedRoute } from "@/lib/observability";
import { prisma } from "@/lib/prisma";

const BRIGHTDATA_BASE_URL = "https://api.brightdata.com";
const DOMAIN = "idealista.com";
const SUCCESS_RATE_THRESHOLD = 0.85;

const postHandler = async (request: Request) => {
  if (!(await isQstashAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (process.env.MARKET_FEATURE_ENABLED === "false") {
    return NextResponse.json({ skipped: true, reason: "MARKET_FEATURE_ENABLED=false" });
  }

  const idealistaOn =
    process.env.MARKET_IDEALISTA_ENABLED === "true" ||
    process.env.MARKET_IDEALISTA_ENABLED === "1";
  if (!idealistaOn) {
    return NextResponse.json({ skipped: true, reason: "MARKET_IDEALISTA_ENABLED=false" });
  }

  const apiToken = process.env.BRIGHTDATA_API_TOKEN?.trim();
  if (!apiToken) {
    console.warn(
      "[cron/market/brightdata-success-rate] BRIGHTDATA_API_TOKEN no configurado",
    );
    return NextResponse.json({
      skipped: true,
      reason: "BRIGHTDATA_API_TOKEN missing",
    });
  }

  const url = `${BRIGHTDATA_BASE_URL}/unblocker/success_rate/${DOMAIN}`;
  let successRate: number | null = null;
  let httpStatus: number | null = null;
  let errorMessage: string | null = null;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      // 30s para no colgar el cron
      signal: AbortSignal.timeout(30_000),
    });
    httpStatus = response.status;
    if (response.ok) {
      const body = (await response.json()) as Record<string, number>;
      const rate = body[DOMAIN];
      if (typeof rate === "number" && Number.isFinite(rate)) {
        successRate = rate;
      } else {
        errorMessage = `respuesta sin clave ${DOMAIN}: ${JSON.stringify(body).slice(0, 200)}`;
      }
    } else {
      const text = await response.text().catch(() => "");
      errorMessage = `HTTP ${response.status}: ${text.slice(0, 200)}`;
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  if (successRate == null) {
    console.error(
      `[cron/market/brightdata-success-rate] no se pudo obtener rate para ${DOMAIN}: ${errorMessage} (status=${httpStatus})`,
    );
    // 200 con skipped: este cron no debe abortar el pipeline si Bright Data no responde.
    return NextResponse.json({
      ok: false,
      skipped: true,
      domain: DOMAIN,
      httpStatus,
      error: errorMessage,
    });
  }

  const occurredAt = new Date();
  const dayBucket = occurredAt.toISOString().slice(0, 10);
  // Idempotencia diaria: una sola medicion por dia. Reutilizamos el evento
  // `MARKET_SNAPSHOT_REFRESHED` con un payload identificable para no anadir
  // un valor de enum nuevo (la migracion de schema queda para V2 cuando
  // multipliquemos metricas externas).
  const fingerprint = `brightdata-success-rate:${DOMAIN}:${dayBucket}`;

  try {
    await prisma.marketEvent.create({
      data: {
        source: "source_d",
        type: "MARKET_SNAPSHOT_REFRESHED",
        occurredAt,
        fingerprint,
        correlationId: fingerprint,
        payload: {
          metric: "brightdata_success_rate",
          domain: DOMAIN,
          successRate,
          threshold: SUCCESS_RATE_THRESHOLD,
          httpStatus,
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/Unique constraint|P2002/i.test(message)) {
      console.error(
        `[cron/market/brightdata-success-rate] error guardando MarketEvent: ${message}`,
      );
    }
    // Idempotencia por fingerprint: si ya existe la medicion del dia, OK.
  }

  if (successRate < SUCCESS_RATE_THRESHOLD) {
    console.warn(
      `[cron/market/brightdata-success-rate] WARN ${DOMAIN} successRate=${successRate.toFixed(4)} < ${SUCCESS_RATE_THRESHOLD}`,
    );
  } else {
    console.log(
      `[cron/market/brightdata-success-rate] ${DOMAIN} successRate=${successRate.toFixed(4)} OK`,
    );
  }

  return NextResponse.json({
    ok: true,
    domain: DOMAIN,
    successRate,
    threshold: SUCCESS_RATE_THRESHOLD,
    alert: successRate < SUCCESS_RATE_THRESHOLD,
  });
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/cron/market/brightdata-success-rate" },
  postHandler,
);

export const maxDuration = 60;
