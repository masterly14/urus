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
import { appendEvent } from "@/lib/event-store";
import { isMatchingPaused, MATCHING_PAUSED_REASON } from "@/lib/matching/pause";
import {
  EXTERNAL_PORTFOLIO_DISABLED_REASON,
  isExternalPortfolioSearchEnabled,
} from "@/lib/statefox/external-search";

type CoverageDecision =
  | "matching_paused"
  | "external_search_disabled"
  | "demand_not_found"
  | "covered"
  | "dedup_skip"
  | "enqueued_microsite";

async function appendCoverageDecisionEvent(args: {
  job: JobRecord;
  demandId: string;
  sourceEventId: string | undefined;
  decision: CoverageDecision;
  reason?: string;
  bestScore?: number;
  threshold?: number;
  comercialId?: string;
  followUpJobType?: string;
}): Promise<void> {
  await appendEvent({
    type: "COBERTURA_DEMANDA_EVALUADA",
    aggregateType: "DEMAND",
    aggregateId: args.demandId,
    payload: {
      jobId: args.job.id,
      jobType: args.job.type,
      decision: args.decision,
      reason: args.reason ?? null,
      sourceEventId: args.sourceEventId ?? null,
      bestScore: args.bestScore ?? null,
      threshold: args.threshold ?? COVERAGE_MIN_SCORE,
      comercialId: args.comercialId ?? null,
      followUpJobType: args.followUpJobType ?? null,
      attempts: args.job.attempts,
    } as JsonValue,
    causationId: args.sourceEventId ?? args.job.sourceEventId ?? undefined,
  });
}

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
    await appendCoverageDecisionEvent({
      job,
      demandId,
      sourceEventId,
      decision: "matching_paused",
      reason: MATCHING_PAUSED_REASON,
    });
    return { success: true };
  }

  if (!isExternalPortfolioSearchEnabled()) {
    console.warn(
      `[coverage] job ${job.id} demandId=${demandId} — omitiendo cartera externa: ${EXTERNAL_PORTFOLIO_DISABLED_REASON}`,
    );
    await appendCoverageDecisionEvent({
      job,
      demandId,
      sourceEventId,
      decision: "external_search_disabled",
      reason: EXTERNAL_PORTFOLIO_DISABLED_REASON,
    });
    return { success: true };
  }

  /**
   * Si el job viene encadenado tras `MATCH_DEMAND_AGAINST_INTERNAL`, el handler
   * previo ya cruzó la cartera interna y conoce el `bestScore`. Lo pasa en el
   * payload para evitar repetir la operación (O(propiedades) por evento).
   */
  const bestScoreOverride =
    typeof payload.bestScoreOverride === "number"
      ? (payload.bestScoreOverride as number)
      : null;

  let bestScore: number;
  if (bestScoreOverride !== null) {
    bestScore = bestScoreOverride;
    console.log(
      `[coverage] job ${job.id} demandId=${demandId} — usando bestScoreOverride=${bestScore} (sin recomputar cruce interno)`,
    );
  } else {
    const result = await evaluateDemandCoverage(demandId);
    if (!result) {
      console.log(
        `[coverage] job ${job.id} demandId=${demandId} — demanda no encontrada, skip`,
      );
      await appendCoverageDecisionEvent({
        job,
        demandId,
        sourceEventId,
        decision: "demand_not_found",
      });
      return { success: true };
    }
    bestScore = result.bestScore;
  }

  if (bestScore >= COVERAGE_MIN_SCORE) {
    console.log(
      `[coverage] job ${job.id} demandId=${demandId} — decision=covered bestScore=${bestScore} (>= ${COVERAGE_MIN_SCORE})`,
    );
    await appendCoverageDecisionEvent({
      job,
      demandId,
      sourceEventId,
      decision: "covered",
      bestScore,
      threshold: COVERAGE_MIN_SCORE,
    });
    return { success: true };
  }

  const hasDuplicate = await hasRecentCoverageSelection(demandId);
  if (hasDuplicate) {
    console.log(
      `[coverage] job ${job.id} demandId=${demandId} — decision=dedup_skip bestScore=${bestScore} (selección de coverage reciente existe)`,
    );
    await appendCoverageDecisionEvent({
      job,
      demandId,
      sourceEventId,
      decision: "dedup_skip",
      reason: "recent_coverage_selection",
      bestScore,
      threshold: COVERAGE_MIN_SCORE,
    });
    return { success: true };
  }

  const comercial = await resolveComercialByDemand(demandId);
  const comercialId = comercial?.id ?? "system";

  const reason = bestScore === 0 ? "zero_matches" : "low_score";

  console.log(
    `[coverage] job ${job.id} demandId=${demandId} — decision=enqueued_microsite bestScore=${bestScore} reason=${reason} comercialId=${comercialId}`,
  );
  await appendCoverageDecisionEvent({
    job,
    demandId,
    sourceEventId,
    decision: "enqueued_microsite",
    reason,
    bestScore,
    threshold: COVERAGE_MIN_SCORE,
    comercialId,
    followUpJobType: "GENERATE_MICROSITE",
  });

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
          coverageBestScore: bestScore,
          sourceEventId: sourceEventId ?? null,
        } as unknown as JsonValue,
        idempotencyKey: `generate_microsite:coverage:${demandId}:${sourceEventId ?? job.id}`,
        sourceEventId,
      },
    ],
  };
}
