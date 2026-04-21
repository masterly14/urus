/**
 * API: Informe IA de Mercado (M7 — Smart Pricing).
 *
 * POST — Genera un nuevo informe estratégico:
 *   1. Llama internamente a GET /api/pricing/mercado para obtener el snapshot.
 *   2. Invoca el grafo LangGraph (market-report-graph).
 *   3. Persiste en market_reports + emite MARKET_INFORME_GENERADO.
 *   4. Devuelve el record completo.
 *
 * GET  — Devuelve el último informe generado para la ciudad.
 */

import { NextResponse } from "next/server";
import {
  getSessionFromRequest,
  unauthorized,
} from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { generateMarketReport } from "@/lib/agents/market-report-graph";
import {
  persistMarketReport,
  getLatestMarketReport,
} from "@/lib/pricing/market-report-repo";
import type { MercadoResponse } from "@/lib/pricing/mercado-types";
import type { MarketReportInputSnapshot } from "@/lib/pricing/market-report-types";

export const runtime = "nodejs";

const LLM_MODEL = "gpt-5.4-mini";

// ── POST: generate new report ─────────────────────────────────────────────────

const postHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as {
    ciudad?: string;
  };
  const ciudad = body.ciudad?.trim() || undefined;

  const mercadoUrl = new URL("/api/pricing/mercado", request.url);
  if (ciudad) mercadoUrl.searchParams.set("ciudad", ciudad);

  const mercadoRes = await fetch(mercadoUrl.toString(), {
    headers: { cookie: request.headers.get("cookie") ?? "" },
  });

  if (!mercadoRes.ok) {
    return NextResponse.json(
      { error: `Error obteniendo datos de mercado: ${mercadoRes.status}` },
      { status: 502 },
    );
  }

  const mercadoData: MercadoResponse = await mercadoRes.json();

  if (mercadoData.zones.length === 0) {
    return NextResponse.json(
      { error: "No hay datos de mercado suficientes para generar el informe." },
      { status: 422 },
    );
  }

  const snapshot: MarketReportInputSnapshot = {
    ciudad: mercadoData.ciudad,
    zones: mercadoData.zones,
    competitors: mercadoData.competitors,
    generatedAt: mercadoData.generatedAt,
  };

  const report = await generateMarketReport(snapshot);

  const record = await persistMarketReport({
    ciudad: snapshot.ciudad,
    generatedBy: session.userId,
    model: LLM_MODEL,
    inputSnapshot: snapshot,
    report,
    tokensUsed: null,
  });

  return NextResponse.json(record, { status: 201 });
};

// ── GET: latest report ────────────────────────────────────────────────────────

const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const { searchParams } = new URL(request.url);
  const ciudad = searchParams.get("ciudad")?.trim() || "Todas";

  const record = await getLatestMarketReport(ciudad);

  if (!record) {
    return NextResponse.json(
      { report: null, message: "No se ha generado ningún informe para esta ciudad." },
      { status: 200 },
    );
  }

  return NextResponse.json(record);
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/pricing/mercado/informe" },
  postHandler,
);

export const GET = withObservedRoute(
  { method: "GET", route: "/api/pricing/mercado/informe" },
  getHandler,
);
