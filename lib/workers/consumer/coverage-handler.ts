/**
 * Job handler para EVALUATE_DEMAND_COVERAGE.
 *
 * Evalúa si una demanda activa está bien cubierta por la cartera interna.
 * Si bestScore < COVERAGE_MIN_SCORE y no hay un microsite reciente de coverage,
 * encola GENERATE_MICROSITE con source=coverage_scan para buscar en Statefox.
 */

import type { JobRecord } from "@/lib/job-queue/types";
import type { HandlerResult } from "./types";
import { evaluateDemandCoverage, COVERAGE_MIN_SCORE } from "@/lib/matching";
import { hasRecentCoverageSelection } from "@/lib/microsite/coverage-dedup";
import { resolveComercialByDemand } from "@/lib/routing/resolve-comercial";
import type { JsonValue } from "@/lib/job-queue/types";
import { isMatchingPaused, MATCHING_PAUSED_REASON } from "@/lib/matching/pause";

export async function handleEvaluateDemandCoverage(
  job: JobRecord,
): Promise<HandlerResult> {
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const demandId = typeof payload.demandId === "string" ? payload.demandId : "";

  if (!demandId) {
    return {
      success: false,
      error: "EVALUATE_DEMAND_COVERAGE sin payload.demandId",
      permanent: true,
    };
  }

  const sourceEventId =
    typeof payload.sourceEventId === "string"
      ? payload.sourceEventId
      : job.sourceEventId ?? undefined;

  if (isMatchingPaused()) {
    console.warn(
      `[coverage] job ${job.id} demandId=${demandId} — cobertura/Statefox pausado: ${MATCHING_PAUSED_REASON}`,
    );
    return { success: true };
  }

  const result = await evaluateDemandCoverage(demandId);

  if (!result) {
    console.log(
      `[coverage] job ${job.id} demandId=${demandId} — demanda no encontrada, skip`,
    );
    return { success: true };
  }

  if (result.bestScore >= COVERAGE_MIN_SCORE) {
    console.log(
      `[coverage] job ${job.id} demandId=${demandId} — decision=covered bestScore=${result.bestScore} (>= ${COVERAGE_MIN_SCORE})`,
    );
    return { success: true };
  }

  const hasDuplicate = await hasRecentCoverageSelection(demandId);
  if (hasDuplicate) {
    console.log(
      `[coverage] job ${job.id} demandId=${demandId} — decision=dedup_skip bestScore=${result.bestScore} (selección de coverage reciente existe)`,
    );
    return { success: true };
  }

  const comercial = await resolveComercialByDemand(demandId);
  const comercialId = comercial?.id ?? "system";

  const reason = result.bestScore === 0 ? "zero_matches" : "low_score";

  console.log(
    `[coverage] job ${job.id} demandId=${demandId} — decision=enqueued_microsite bestScore=${result.bestScore} reason=${reason} comercialId=${comercialId}`,
  );

  return {
    success: true,
    followUpJobs: [
      {
        type: "GENERATE_MICROSITE",
        payload: {
          demandId,
          comercialId,
          source: "coverage_scan",
          notifyOnEmpty: false,
          coverageReason: reason,
          coverageBestScore: result.bestScore,
          sourceEventId: sourceEventId ?? null,
        } as unknown as JsonValue,
        idempotencyKey: `generate_microsite:coverage:${demandId}:${sourceEventId ?? job.id}`,
        sourceEventId,
      },
    ],
  };
}
