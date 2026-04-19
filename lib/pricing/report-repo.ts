import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { PricingAnalysisResult } from "./types";

export interface PersistPricingReportInput {
  result: PricingAnalysisResult;
  sourceTrigger?: string;
  lastAnalysisEventId?: string | null;
  lastRecommendationEventId?: string | null;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export async function persistPricingReport(
  input: PersistPricingReportInput,
): Promise<void> {
  const { result } = input;

  await prisma.pricingReport.upsert({
    where: { propertyCode: result.propertyCode },
    update: {
      analyzedAt: new Date(result.analyzedAt),
      sourceTrigger: input.sourceTrigger ?? "manual",
      semaforo: result.stats.semaforo,
      gapPorcentaje: result.stats.gapPorcentaje,
      totalComparables: result.stats.totalComparables,
      input: toJson(result.input),
      stats: toJson(result.stats),
      comparables: toJson(result.comparables),
      recommendation: result.recommendation
        ? toJson(result.recommendation)
        : Prisma.JsonNull,
      recommendationError: result.recommendationError ?? null,
      trend: result.trend ? toJson(result.trend) : Prisma.JsonNull,
      queryMeta: toJson(result.queryMeta),
      lastAnalysisEventId: input.lastAnalysisEventId ?? null,
      lastRecommendationEventId: input.lastRecommendationEventId ?? null,
    },
    create: {
      propertyCode: result.propertyCode,
      analyzedAt: new Date(result.analyzedAt),
      sourceTrigger: input.sourceTrigger ?? "manual",
      semaforo: result.stats.semaforo,
      gapPorcentaje: result.stats.gapPorcentaje,
      totalComparables: result.stats.totalComparables,
      input: toJson(result.input),
      stats: toJson(result.stats),
      comparables: toJson(result.comparables),
      recommendation: result.recommendation
        ? toJson(result.recommendation)
        : Prisma.JsonNull,
      recommendationError: result.recommendationError ?? null,
      trend: result.trend ? toJson(result.trend) : Prisma.JsonNull,
      queryMeta: toJson(result.queryMeta),
      lastAnalysisEventId: input.lastAnalysisEventId ?? null,
      lastRecommendationEventId: input.lastRecommendationEventId ?? null,
    },
  });

  console.log(
    `[pricing/report] materializado property=${result.propertyCode} semaforo=${result.stats.semaforo} analyzedAt=${result.analyzedAt}`,
  );
}

export async function getLatestPricingReport(
  propertyCode: string,
): Promise<PricingAnalysisResult | null> {
  const row = await prisma.pricingReport.findUnique({
    where: { propertyCode },
  });

  if (!row) return null;

  return {
    propertyCode: row.propertyCode,
    input: row.input as unknown as PricingAnalysisResult["input"],
    stats: row.stats as unknown as PricingAnalysisResult["stats"],
    comparables: row.comparables as unknown as PricingAnalysisResult["comparables"],
    recommendation: (row.recommendation ?? undefined) as unknown as PricingAnalysisResult["recommendation"],
    recommendationError: row.recommendationError ?? undefined,
    trend: (row.trend ?? undefined) as unknown as PricingAnalysisResult["trend"],
    queryMeta: row.queryMeta as unknown as PricingAnalysisResult["queryMeta"],
    analyzedAt: row.analyzedAt.toISOString(),
  };
}
