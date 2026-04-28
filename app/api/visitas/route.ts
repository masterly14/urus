import { NextResponse } from "next/server";
import { getSessionFromRequest, isCeoOrAdmin, unauthorized } from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { listVisitInterestPackages } from "@/lib/visitas/interest-package";

const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
  const requestedComercialId = url.searchParams.get("comercialId");
  const comercialId = isCeoOrAdmin(session.role)
    ? requestedComercialId
    : session.comercialId;
  if (!isCeoOrAdmin(session.role) && !comercialId) {
    return NextResponse.json({ ok: true, packages: [] });
  }

  const packages = await listVisitInterestPackages({
    comercialId,
    limit,
  });

  return NextResponse.json({
    ok: true,
    packages,
  });
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/visitas" },
  getHandler,
);
