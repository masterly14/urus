/**
 * GET /api/market/identity/candidates
 *
 * Devuelve la cola de eventos `MARKET_PROPERTY_REVIEW_REQUIRED` pendientes
 * (`resolvedAt IS NULL`). Cada item incluye el listing origen, el mejor
 * candidato y otros candidatos para que el revisor decida visualmente.
 *
 * Permisos: admin/CEO.
 */

import { NextResponse } from "next/server";
import {
  forbidden,
  getSession,
  isCeoOrAdmin,
  unauthorized,
} from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { listReviewCandidates } from "@/lib/market/identity-review";

const getHandler = async (request: Request) => {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

  const url = new URL(request.url);
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Math.min(Math.max(1, Number(limitRaw)), 100) : 50;

  const result = await listReviewCandidates(limit);
  return NextResponse.json({ ok: true, ...result });
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/market/identity/candidates" },
  getHandler,
);

export const dynamic = "force-dynamic";
