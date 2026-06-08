/**
 * Job handler: RUN_PRICING_ANALYSIS
 *
 * Ejecuta el motor de pricing completo (Neon + Statefox + LangGraph)
 * para una propiedad y, si tiene éxito, encola la notificación WhatsApp.
 */

import type { JobRecord } from "@/lib/job-queue/types";
import type { HandlerResult } from "./types";
import type { PricingOptions } from "@/lib/pricing";
import { getPricingStatefoxMaxPages } from "@/lib/pricing/runtime-config";
import {
  runPricingAnalysis,
  PricingDataIncompleteError,
  PricingNotEligibleError,
} from "@/lib/pricing";
import { enqueueJob } from "@/lib/job-queue";
import {
  notifyPricingAnalysisFailed,
  notifyPricingAnalysisReady,
} from "@/lib/notifications/pricing-analysis";

export async function handlePricingAnalysis(
  job: JobRecord,
): Promise<HandlerResult> {
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const propertyCode =
    typeof payload.propertyCode === "string" ? payload.propertyCode : null;

  if (!propertyCode) {
    console.error(
      `[consumer:pricing] RUN_PRICING_ANALYSIS job ${job.id} sin propertyCode`,
    );
    return { success: false, error: "Job sin propertyCode" };
  }

  const trigger = typeof payload.trigger === "string" ? payload.trigger : undefined;
  const requestedByUserId =
    typeof payload.requestedByUserId === "string" ? payload.requestedByUserId : null;
  const options: PricingOptions = {
    maxPages:
      typeof payload.maxPages === "number"
        ? payload.maxPages
        : getPricingStatefoxMaxPages(trigger),
    sourceTrigger: trigger ?? "worker_job",
  };
  if (typeof payload.generateRecommendation === "boolean") {
    options.generateRecommendation = payload.generateRecommendation;
  }

  console.log(
    `[consumer:pricing] Ejecutando análisis de pricing para ${propertyCode}` +
      (trigger ? ` (trigger=${trigger})` : ""),
  );

  try {
    const result = await runPricingAnalysis(propertyCode, options);

    console.log(
      `[consumer:pricing] Análisis completado: ${propertyCode} semáforo=${result.stats.semaforo} gap=${result.stats.gapPorcentaje}% comparables=${result.stats.totalComparables}`,
    );

    await enqueueJob({
      type: "NOTIFY_PRICING_WHATSAPP",
      payload: {
        propertyCode,
        semaforo: result.stats.semaforo,
        gapPorcentaje: result.stats.gapPorcentaje,
        totalComparables: result.stats.totalComparables,
        accion: result.recommendation?.accion ?? null,
        analyzedAt: result.analyzedAt,
      },
      idempotencyKey: `notify-pricing:${propertyCode}:${result.analyzedAt}`,
      sourceEventId: job.sourceEventId ?? undefined,
    });

    if (requestedByUserId) {
      await notifyPricingAnalysisReady({
        userId: requestedByUserId,
        propertyCode,
      });
    }

    return { success: true };
  } catch (err) {
    if (err instanceof PricingNotEligibleError) {
      console.warn(
        `[consumer:pricing] ${propertyCode} no elegible para Smart Pricing: ${err.reasons.join("; ")}`,
      );
      if (requestedByUserId) {
        await notifyPricingAnalysisFailed({
          userId: requestedByUserId,
          propertyCode,
          errorMessage: "La propiedad no cumple los criterios para este análisis.",
        });
      }
      return { success: true };
    }

    if (err instanceof PricingDataIncompleteError) {
      console.warn(
        `[consumer:pricing] Datos incompletos para ${propertyCode}: ${err.message}`,
      );
      if (requestedByUserId) {
        await notifyPricingAnalysisFailed({
          userId: requestedByUserId,
          propertyCode,
          errorMessage:
            "Faltan datos de la propiedad para completar el análisis.",
        });
      }
      return { success: true };
    }

    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(
      `[consumer:pricing] Error en análisis de ${propertyCode}: ${errorMsg}`,
    );
    if (requestedByUserId) {
      await notifyPricingAnalysisFailed({
        userId: requestedByUserId,
        propertyCode,
        errorMessage: errorMsg,
      });
    }
    return { success: false, error: errorMsg };
  }
}
