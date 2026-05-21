import { Prisma } from "@prisma/client";
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

function withComparabilityDefaults(
  queryMeta: PricingAnalysisResult["queryMeta"] | Record<string, unknown>,
): PricingAnalysisResult["queryMeta"] {
  const base = queryMeta as Partial<PricingAnalysisResult["queryMeta"]>;
  return {
    endpoint: base.endpoint ?? "snapshot",
    housing: base.housing ?? "flat",
    type: base.type ?? "sale",
    pagesScanned: base.pagesScanned ?? 0,
    totalResultsFromAPI: base.totalResultsFromAPI ?? 0,
    filteredResults: base.filteredResults ?? 0,
    comparability: base.comparability ?? {
      comparabilityFilterApplied: false,
      effectiveAllowedZoneCodes: [],
      effectiveExcludedZoneCodes: [],
      candidatesBeforeFilter: 0,
      candidatesAfterFilter: 0,
      excludedByReason: {},
      comparableDecisions: [],
    },
  };
}

export async function persistPricingReport(
  input: PersistPricingReportInput,
): Promise<void> {
  const { result } = input;
  const queryMetaWithComparability = withComparabilityDefaults({
    ...result.queryMeta,
    comparabilityProfile: result.comparabilityProfile ?? null,
  });

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
      zoneStudy: result.zoneStudy ? toJson(result.zoneStudy) : Prisma.JsonNull,
      optimalPricing: result.optimalPricing ? toJson(result.optimalPricing) : Prisma.JsonNull,
      queryMeta: toJson(queryMetaWithComparability),
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
      zoneStudy: result.zoneStudy ? toJson(result.zoneStudy) : Prisma.JsonNull,
      optimalPricing: result.optimalPricing ? toJson(result.optimalPricing) : Prisma.JsonNull,
      queryMeta: toJson(queryMetaWithComparability),
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

  const queryMetaRaw = row.queryMeta as Record<string, unknown>;
  const queryMeta = withComparabilityDefaults(queryMetaRaw) as PricingAnalysisResult["queryMeta"] & {
    comparabilityProfile?: PricingAnalysisResult["comparabilityProfile"] | null;
  };

  return {
    propertyCode: row.propertyCode,
    input: row.input as unknown as PricingAnalysisResult["input"],
    stats: row.stats as unknown as PricingAnalysisResult["stats"],
    comparables: row.comparables as unknown as PricingAnalysisResult["comparables"],
    recommendation: (row.recommendation ?? undefined) as unknown as PricingAnalysisResult["recommendation"],
    recommendationError: row.recommendationError ?? undefined,
    trend: (row.trend ?? undefined) as unknown as PricingAnalysisResult["trend"],
    zoneStudy: (row.zoneStudy ?? undefined) as unknown as PricingAnalysisResult["zoneStudy"],
    optimalPricing: (row.optimalPricing ?? undefined) as unknown as PricingAnalysisResult["optimalPricing"],
    queryMeta,
    comparabilityProfile: queryMeta.comparabilityProfile ?? undefined,
    analyzedAt: row.analyzedAt.toISOString(),
  };
}
