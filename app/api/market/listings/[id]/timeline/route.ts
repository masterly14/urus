/**
 * GET /api/market/listings/:id/timeline
 *
 * Devuelve hasta 100 versiones y 100 eventos asociados al listing,
 * ordenados de mas recientes a mas antiguos.
 */

import { NextResponse } from "next/server";
import {
  forbidden,
  getSession,
  isCeoOrAdmin,
  unauthorized,
} from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { getListingTimeline } from "@/lib/market/api";

const getHandler = async (
  _request: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

  const { id } = await context.params;
  const timeline = await getListingTimeline(id);
  return NextResponse.json({ ok: true, listingId: id, ...timeline });
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/market/listings/[id]/timeline" },
  getHandler,
);

export const dynamic = "force-dynamic";
