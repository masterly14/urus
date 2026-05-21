import { NextResponse } from "next/server";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { getPricingAnalysisStatusForProperty } from "@/lib/pricing/analysis-status";
import { withObservedRoute } from "@/lib/observability";

export const runtime = "nodejs";

const getHandler = async (
  request: Request,
  context: { params: Promise<{ code: string }> },
) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const { code } = await context.params;
  const status = await getPricingAnalysisStatusForProperty(code);

  return NextResponse.json({
    ok: true,
    propertyCode: code,
    status: status.status,
    message: status.message ?? null,
  });
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/pricing/status/[code]" },
  getHandler,
);
