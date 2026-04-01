/**
 * Job handler: RUN_PRICING_ANALYSIS
 *
 * Ejecuta el motor de pricing completo (Neon + Statefox + LangGraph)
 * para una propiedad y, si tiene éxito, encola la notificación WhatsApp.
 */

import type { JobRecord } from "@/lib/job-queue/types";
import type { HandlerResult } from "./types";
import type { PricingOptions } from "@/lib/pricing";
import {
  runPricingAnalysis,
  PricingDataIncompleteError,
} from "@/lib/pricing";
import { enqueueJob } from "@/lib/job-queue";

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
  const options: PricingOptions = {};
  if (typeof payload.maxPages === "number") options.maxPages = payload.maxPages;
  if (typeof payload.generateRecommendation === "boolean")
    options.generateRecommendation = payload.generateRecommendation;

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

    return { success: true };
  } catch (err) {
    if (err instanceof PricingDataIncompleteError) {
      console.warn(
        `[consumer:pricing] Datos incompletos para ${propertyCode}: ${err.message}`,
      );
      return { success: true };
    }

    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(
      `[consumer:pricing] Error en análisis de ${propertyCode}: ${errorMsg}`,
    );
    return { success: false, error: errorMsg };
  }
}
