/**
 * GET /api/market/snapshot?city=cordoba
 *
 * Devuelve el contenido vigente de MarketSnapshotIndex para una ciudad,
 * con todas las combinaciones (housingType, operation) materializadas.
 */

import { NextResponse } from "next/server";
import {
  forbidden,
  getSession,
  isCeoOrAdmin,
  unauthorized,
} from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { getSnapshotForCity } from "@/lib/market/api";

const getHandler = async (request: Request) => {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

  const url = new URL(request.url);
  const city = url.searchParams.get("city");
  if (!city) {
    return NextResponse.json(
      { ok: false, error: "city es requerido" },
      { status: 400 },
    );
  }

  const result = await getSnapshotForCity(city);
  return NextResponse.json({ ok: true, city, ...result });
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/market/snapshot" },
  getHandler,
);

export const dynamic = "force-dynamic";
