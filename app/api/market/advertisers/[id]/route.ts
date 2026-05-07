/**
 * GET /api/market/advertisers/:id
 *
 * Detalle de un publicante (`MarketAdvertiser`) con todos sus listings
 * agrupados por portal (`bySource`).
 *
 * Permisos: cualquier usuario autenticado.
 */

import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { getAdvertiserDetail } from "@/lib/market/advertisers";

const getHandler = async (
  _request: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const session = await getSession();
  if (!session) return unauthorized();

  const { id } = await context.params;
  const advertiser = await getAdvertiserDetail(id);
  if (!advertiser) {
    return NextResponse.json(
      { ok: false, error: "MarketAdvertiser no encontrado" },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, advertiser });
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/market/advertisers/[id]" },
  getHandler,
);

export const dynamic = "force-dynamic";
