import { NextResponse } from "next/server";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { getCachedPricingReport } from "@/lib/pricing/cached-queries";
import { withObservedRoute } from "@/lib/observability";

export const runtime = "nodejs";

const getHandler = async (
  request: Request,
  context: { params: Promise<{ code: string }> },
) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const { code } = await context.params;
  const report = await getCachedPricingReport(code);
  if (!report) {
    return NextResponse.json(
      {
        error: "Estudio no encontrado",
        message: `No existe un estudio materializado para ${code}.`,
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    propertyCode: report.propertyCode,
    analyzedAt: report.analyzedAt,
    input: report.input,
    stats: report.stats,
    optimalPricing: report.optimalPricing ?? null,
    zoneStudy: report.zoneStudy ?? null,
    comparabilityProfile: report.comparabilityProfile ?? null,
  });
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/pricing/estudio/[code]" },
  getHandler,
);
