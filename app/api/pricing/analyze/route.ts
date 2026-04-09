import { NextResponse } from "next/server";
import { z } from "zod";
import { runPricingAnalysis, PricingDataIncompleteError } from "@/lib/pricing";
import { withObservedRoute } from "@/lib/observability";


export const runtime = "nodejs";

const RequestSchema = z.object({
  propertyCode: z.string().min(1),
  priceRangePercent: z.number().min(1).max(100).optional(),
  metersRangePercent: z.number().min(1).max(100).optional(),
  maxPages: z.number().min(1).max(100).optional(),
  minComparables: z.number().min(1).max(100).optional(),
  generateRecommendation: z.boolean().optional(),
});

const postHandler = async (request: Request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { propertyCode, priceRangePercent, metersRangePercent, maxPages, minComparables, generateRecommendation } = parsed.data;

  try {
    const result = await runPricingAnalysis(propertyCode, {
      priceRangePercent,
      metersRangePercent,
      maxPages,
      minComparables,
      generateRecommendation,
      sourceTrigger: "api_manual",
    });

    console.log(
      `[pricing/analyze] Análisis completado: property=${propertyCode} comparables=${result.stats.totalComparables} semaforo=${result.stats.semaforo} recomendacion=${result.recommendation?.accion ?? result.recommendationError ?? "skipped"}`,
    );

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof PricingDataIncompleteError) {
      return NextResponse.json(
        {
          error: "Datos incompletos para pricing",
          missingFields: err.missingFields,
          message: err.message,
        },
        { status: 422 },
      );
    }

    console.error(`[pricing/analyze] Error: ${err instanceof Error ? err.message : String(err)}`);
    return NextResponse.json(
      { error: "Error interno al ejecutar análisis de pricing" },
      { status: 500 },
    );
  }
}

export const POST = withObservedRoute({ method: "POST", route: "/api/pricing/analyze" }, postHandler);
