/**
 * GET /api/market/properties/:id
 *
 * Devuelve una MarketProperty (cluster cross-portal) con todos sus listings.
 */

import { NextResponse } from "next/server";
import {
  forbidden,
  getSession,
  isCeoOrAdmin,
  unauthorized,
} from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { getPropertyById } from "@/lib/market/api";

const getHandler = async (
  _request: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

  const { id } = await context.params;
  const property = await getPropertyById(id);
  if (!property) {
    return NextResponse.json(
      { ok: false, error: "MarketProperty no encontrada" },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, property });
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/market/properties/[id]" },
  getHandler,
);

export const dynamic = "force-dynamic";
