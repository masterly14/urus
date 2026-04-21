/**
 * Motor de Pricing v1 (M7) — orquestador.
 *
 * Flujo:
 *   1. Extrae variables del inmueble desde Neon (PropertyCurrent + PropertySnapshot.raw)
 *   2. Consulta Statefox API REST (/snapshot, inventario completo) y filtra en memoria
 *   3. Calcula estadísticas del cluster (media, mediana, desviación, segmentación)
 *   4. Asigna semáforo y persiste evento PRICING_ANALISIS_GENERADO en Event Store
 *   5. (Opcional) Invoca motor de recomendación LangGraph → diagnóstico + recomendaciones
 */

import { extractPropertyForPricing } from "./extract-property";
import { fetchPricingComparables } from "./fetch-comparables";
import { analyzeCluster } from "./analyze-cluster";
import { generatePricingRecommendation } from "@/lib/agents/pricing-recommendation-graph";
import type { JsonValue } from "@/lib/event-store";
import { appendEvent } from "@/lib/event-store";
import { mapTiposToHousing } from "@/lib/statefox/query-builder";
import type { PricingAnalysisResult, PricingOptions } from "./types";
import { buildPricingTrendSummary } from "./trend-summary";
import { persistPricingReport } from "./report-repo";

export type { PricingAnalysisResult, PricingOptions } from "./types";
export type { PricingPropertyInput, PricingComparable, PricingComparableAdvertiser, PricingClusterStats, SemaforoStatus } from "./types";
export type { PricingRecommendation, PricingAction } from "./recommendation-types";
export { PricingRecommendationSchema } from "./recommendation-types";
export { PricingDataIncompleteError, PricingNotEligibleError } from "./types";
export { extractPropertyForPricing } from "./extract-property";
export { fetchPricingComparables } from "./fetch-comparables";
export { analyzeCluster } from "./analyze-cluster";
export { buildPricingTrendSummary } from "./trend-summary";
export { getLatestPricingReport, persistPricingReport } from "./report-repo";

export async function runPricingAnalysis(
  propertyCode: string,
  options?: PricingOptions,
): Promise<PricingAnalysisResult> {
  const input = await extractPropertyForPricing(propertyCode);

  const housing = mapTiposToHousing(input.tipologiaNombre);

  const { comparables, totalResultsFromAPI, pagesScanned } = await fetchPricingComparables(input, {
    priceRangePercent: options?.priceRangePercent,
    metersRangePercent: options?.metersRangePercent,
    maxPages: options?.maxPages,
    minComparables: options?.minComparables,
  });

  const stats = analyzeCluster(input, comparables);

  const result: PricingAnalysisResult = {
    propertyCode,
    input,
    comparables,
    stats,
    analyzedAt: new Date().toISOString(),
    trend: buildPricingTrendSummary({ input, comparables, stats }),
    queryMeta: {
      endpoint: "snapshot",
      housing,
      type: input.tipoOperacion,
      pagesScanned,
      totalResultsFromAPI,
      filteredResults: comparables.length,
    },
  };

  const analysisEvent = await appendEvent({
    type: "PRICING_ANALISIS_GENERADO",
    aggregateType: "PROPERTY",
    aggregateId: propertyCode,
    payload: {
      stats: result.stats,
      trend: result.trend,
      queryMeta: result.queryMeta,
      analyzedAt: result.analyzedAt,
      comparablesCount: comparables.length,
    } as unknown as JsonValue,
  });

  // Motor de recomendación IA (LangGraph) — degradación graceful si falla
  let recommendationEventId: string | null = null;
  if (options?.generateRecommendation !== false) {
    try {
      const recommendation = await generatePricingRecommendation(result);
      result.recommendation = recommendation;

      const recommendationEvent = await appendEvent({
        type: "PRICING_RECOMENDACION_GENERADA",
        aggregateType: "PROPERTY",
        aggregateId: propertyCode,
        payload: {
          accion: recommendation.accion,
          diagnostico: recommendation.diagnostico,
          recomendaciones: recommendation.recomendaciones,
          precioSugeridoMin: recommendation.precioSugeridoMin,
          precioSugeridoMax: recommendation.precioSugeridoMax,
          confidence: recommendation.confidence,
          analyzedAt: result.analyzedAt,
        },
      });
      recommendationEventId = recommendationEvent.id;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(
        `[pricing] Error en motor de recomendación para ${propertyCode}: ${errorMsg}`,
      );
      result.recommendationError = errorMsg;
    }
  }

  await persistPricingReport({
    result,
    sourceTrigger: options?.sourceTrigger ?? "manual",
    lastAnalysisEventId: analysisEvent.id,
    lastRecommendationEventId: recommendationEventId,
  });

  return result;
}
