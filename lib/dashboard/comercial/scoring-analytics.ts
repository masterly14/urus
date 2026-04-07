import { prisma } from "@/lib/prisma";
import type { DashboardDateRange } from "./queries";

// ── Conversión por rango de score ───────────────────────────────────────────

export interface ScoreRangeConversion {
  range: string;
  totalLeads: number;
  closedLeads: number;
  conversionRate: number;
}

/**
 * Conversion rate bucketed by score ranges aligned with SLA tiers:
 * 80+, 60-79, 40-59, <40.
 */
export async function getConversionByScoreRange(
  dateRange: DashboardDateRange,
): Promise<ScoreRangeConversion[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      range: string;
      totalLeads: number;
      closedLeads: number;
    }>
  >`
    WITH lead_outcomes AS (
      SELECT
        lf."leadId",
        lf.score,
        CASE
          WHEN lf.score >= 80 THEN '80+'
          WHEN lf.score >= 60 THEN '60-79'
          WHEN lf.score >= 40 THEN '40-59'
          ELSE '<40'
        END AS range,
        CASE WHEN op.id IS NOT NULL THEN 1 ELSE 0 END AS closed
      FROM "commercial_lead_facts" lf
      LEFT JOIN "commercial_operation_facts" op
        ON op."sourceEventId" = lf."leadId"
        AND op."closedAt" IS NOT NULL
      WHERE lf.score IS NOT NULL
        AND lf."createdAt" >= ${dateRange.from}
        AND lf."createdAt" < ${dateRange.to}
    )
    SELECT
      range,
      COUNT(*)::int AS "totalLeads",
      SUM(closed)::int AS "closedLeads"
    FROM lead_outcomes
    GROUP BY range
    ORDER BY
      CASE range
        WHEN '80+' THEN 1
        WHEN '60-79' THEN 2
        WHEN '40-59' THEN 3
        ELSE 4
      END;
  `;

  return rows.map((r) => ({
    range: r.range,
    totalLeads: r.totalLeads,
    closedLeads: r.closedLeads,
    conversionRate: r.totalLeads > 0 ? r.closedLeads / r.totalLeads : 0,
  }));
}

// ── Score asignado vs resultado real ────────────────────────────────────────

export interface ScorePredictionAccuracy {
  totalPredictedHigh: number;
  totalPredictedLow: number;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1Score: number;
}

/**
 * Binary classification accuracy: score >=50 means "predicted to close".
 */
export async function getScorePredictionAccuracy(
  dateRange: DashboardDateRange,
): Promise<ScorePredictionAccuracy> {
  const rows = await prisma.$queryRaw<
    Array<{
      predicted: boolean;
      actual: boolean;
      count: number;
    }>
  >`
    SELECT
      (lf.score >= 50) AS predicted,
      (op.id IS NOT NULL) AS actual,
      COUNT(*)::int AS count
    FROM "commercial_lead_facts" lf
    LEFT JOIN "commercial_operation_facts" op
      ON op."sourceEventId" = lf."leadId"
      AND op."closedAt" IS NOT NULL
    WHERE lf.score IS NOT NULL
      AND lf."createdAt" >= ${dateRange.from}
      AND lf."createdAt" < ${dateRange.to}
    GROUP BY predicted, actual;
  `;

  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const r of rows) {
    if (r.predicted && r.actual) tp = r.count;
    else if (r.predicted && !r.actual) fp = r.count;
    else if (!r.predicted && !r.actual) tn = r.count;
    else fn = r.count;
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    totalPredictedHigh: tp + fp,
    totalPredictedLow: tn + fn,
    truePositives: tp,
    falsePositives: fp,
    trueNegatives: tn,
    falseNegatives: fn,
    precision,
    recall,
    f1Score,
  };
}

// ── Drift de pesos entre versiones ──────────────────────────────────────────

export interface WeightVersionDrift {
  version: number;
  weightPclose: number;
  weightValue: number;
  weightUrgency: number;
  accuracy: number;
  backtestScore: number;
  sampleSize: number;
  activated: boolean;
  createdAt: Date;
}

export async function getWeightVersionHistory(
  limit = 20,
): Promise<WeightVersionDrift[]> {
  const rows = await prisma.scoringModelVersion.findMany({
    orderBy: { version: "desc" },
    take: limit,
    select: {
      version: true,
      weightPclose: true,
      weightValue: true,
      weightUrgency: true,
      accuracy: true,
      backtestScore: true,
      sampleSize: true,
      activatedAt: true,
      createdAt: true,
    },
  });

  return rows.map((r) => ({
    version: r.version,
    weightPclose: r.weightPclose,
    weightValue: r.weightValue,
    weightUrgency: r.weightUrgency,
    accuracy: r.accuracy,
    backtestScore: r.backtestScore,
    sampleSize: r.sampleSize,
    activated: r.activatedAt != null,
    createdAt: r.createdAt,
  }));
}

// ── AI vs Rules comparison ──────────────────────────────────────────────────

export interface AIScoringStats {
  totalLeads: number;
  aiScoredLeads: number;
  avgAiConfidence: number | null;
  avgScoreWithAI: number | null;
  avgScoreWithoutAI: number | null;
}

export async function getAIScoringStats(
  dateRange: DashboardDateRange,
): Promise<AIScoringStats> {
  const rows = await prisma.$queryRaw<
    Array<{
      totalLeads: number;
      aiScoredLeads: number;
      avgAiConfidence: number | null;
      avgScoreWithAI: number | null;
      avgScoreWithoutAI: number | null;
    }>
  >`
    SELECT
      COUNT(*)::int AS "totalLeads",
      COUNT(*) FILTER (WHERE "aiScoringUsed" = true)::int AS "aiScoredLeads",
      AVG("aiConfidence") FILTER (WHERE "aiScoringUsed" = true) AS "avgAiConfidence",
      AVG(score) FILTER (WHERE "aiScoringUsed" = true) AS "avgScoreWithAI",
      AVG(score) FILTER (WHERE "aiScoringUsed" = false) AS "avgScoreWithoutAI"
    FROM "commercial_lead_facts"
    WHERE score IS NOT NULL
      AND "createdAt" >= ${dateRange.from}
      AND "createdAt" < ${dateRange.to};
  `;

  const row = rows[0];
  return {
    totalLeads: row?.totalLeads ?? 0,
    aiScoredLeads: row?.aiScoredLeads ?? 0,
    avgAiConfidence: row?.avgAiConfidence ?? null,
    avgScoreWithAI: row?.avgScoreWithAI ?? null,
    avgScoreWithoutAI: row?.avgScoreWithoutAI ?? null,
  };
}
