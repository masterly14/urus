/**
 * GET /api/market/listings/:id
 *
 * Devuelve un MarketListing canonico por id. 404 si no existe.
 */

import { NextResponse } from "next/server";
import {
  forbidden,
  getSession,
  isCeoOrAdmin,
  unauthorized,
} from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { getListingById } from "@/lib/market/api";

const getHandler = async (
  _request: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

  const { id } = await context.params;
  const listing = await getListingById(id);
  if (!listing) {
    return NextResponse.json(
      { ok: false, error: "MarketListing no encontrado" },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, listing });
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/market/listings/[id]" },
  getHandler,
);

export const dynamic = "force-dynamic";
