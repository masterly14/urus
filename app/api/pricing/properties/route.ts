import { NextResponse } from "next/server";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { getCachedPricingProperties } from "@/lib/pricing/cached-queries";
import { getPricingAnalysisStatusMap } from "@/lib/pricing/analysis-status";
import { withObservedRoute } from "@/lib/observability";
import { prisma } from "@/lib/prisma";


export const runtime = "nodejs";

const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const { searchParams } = new URL(request.url);
  const ciudad = searchParams.get("ciudad")?.trim() || undefined;
  const estado = searchParams.get("estado")?.trim() || undefined;

  const properties = await getCachedPricingProperties(ciudad, estado);
  const statusMap = await getPricingAnalysisStatusMap(
    properties.map((property) => property.codigo),
  );
  const reportRows = await prisma.pricingReport.findMany({
    where: {
      propertyCode: {
        in: properties.map((property) => property.codigo),
      },
    },
    select: {
      propertyCode: true,
      optimalPricing: true,
      zoneStudy: true,
      analyzedAt: true,
    },
  });
  const reportMap = new Map(reportRows.map((row) => [row.propertyCode, row]));

  const propertiesWithStatus = properties.map((property) => ({
    ...property,
    analysisStatus: statusMap[property.codigo]?.status ?? "idle",
    optimalPriceRange: {
      min:
        (reportMap.get(property.codigo)?.optimalPricing as { recommendedMinPrice?: number } | null)
          ?.recommendedMinPrice ?? null,
      max:
        (reportMap.get(property.codigo)?.optimalPricing as { recommendedMaxPrice?: number } | null)
          ?.recommendedMaxPrice ?? null,
    },
    densityBucket:
      (reportMap.get(property.codigo)?.zoneStudy as {
        demographicsSummary?: {
          densityBucket?: "baja" | "media" | "alta" | "muy_alta" | "sin_datos";
        };
      } | null)?.demographicsSummary?.densityBucket ?? "sin_datos",
    analyzedAt: reportMap.get(property.codigo)?.analyzedAt?.toISOString() ?? null,
  }));

  return NextResponse.json({ properties: propertiesWithStatus });
};

export const GET = withObservedRoute({ method: "GET", route: "/api/pricing/properties" }, getHandler);
