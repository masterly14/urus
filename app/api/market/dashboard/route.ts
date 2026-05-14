/**
 * GET /api/market/dashboard?city=&days=
 *
 * Devuelve agregados para `/platform/market/dashboard`: KPIs, agregaciones
 * por zona y tipologia, evolucion temporal de eur/m² mediano y top
 * advertisers por inventario activo.
 *
 * Permisos: cualquier usuario autenticado.
 */

import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { getDashboardData } from "@/lib/market/dashboard";

const DEFAULT_CITY = "cordoba";

const getHandler = async (request: Request) => {
  const session = await getSession();
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const city = url.searchParams.get("city")?.trim() || DEFAULT_CITY;
  const daysRaw = url.searchParams.get("days");
  const days = daysRaw ? Math.min(Math.max(7, Number(daysRaw)), 90) : 30;

  const data = await getDashboardData(city, days);
  return NextResponse.json({ ok: true, ...data });
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/market/dashboard" },
  getHandler,
);

export const dynamic = "force-dynamic";
