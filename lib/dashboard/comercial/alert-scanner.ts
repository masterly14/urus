import { prisma } from "@/lib/prisma";
import {
  getComercialesDashboard,
  getLeadNoFollowUpThresholdHours,
  type ComercialesDashboardRow,
  type DashboardDateRange,
} from "./queries";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AlertType = "drop" | "sla_breach" | "deviation";
export type AlertSeverity = "low" | "medium" | "high";

export interface AlertCandidate {
  comercialId: string;
  comercialNombre: string;
  type: AlertType;
  severity: AlertSeverity;
  metric: string;
  message: string;
  currentValue: number | null;
  baselineValue: number | null;
  threshold: number | null;
  details: Record<string, unknown>;
}

export interface ScanResult {
  alerts: AlertCandidate[];
  dropCount: number;
  slaCount: number;
  deviationCount: number;
  deduplicatedCount: number;
}

// ---------------------------------------------------------------------------
// Config (env-configurable)
// ---------------------------------------------------------------------------

export function getAlertConfig() {
  return {
    dropThreshold: envFloat("DASHBOARD_ALERT_DROP_THRESHOLD", 0.30),
    slaLostLeadThreshold: envInt("DASHBOARD_ALERT_SLA_LOST_LEAD_THRESHOLD", 3),
    deviationZScore: envFloat("DASHBOARD_ALERT_DEVIATION_ZSCORE", 1.5),
    deduplicationWindowDays: 7,
  };
}

function envFloat(key: string, fallback: number): number {
  const raw = process.env[key];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(n: number, now: Date): Date {
  return new Date(now.getTime() - n * DAY_MS);
}

// ---------------------------------------------------------------------------
// 1. Performance drop detection (2 weeks vs 4-week baseline)
// ---------------------------------------------------------------------------

type MetricKey = "estimatedRevenueEur" | "conversionLeadToVisit" | "conversionVisitToClose" | "activity";

const METRIC_LABELS: Record<MetricKey, string> = {
  estimatedRevenueEur: "Facturación estimada",
  conversionLeadToVisit: "Conversión lead→visita",
  conversionVisitToClose: "Conversión visita→cierre",
  activity: "Actividad (leads + visitas)",
};

function getActivity(row: ComercialesDashboardRow): number {
  return row.leadsAssigned + row.visits;
}

function computeDropRatio(current: number, baseline: number): number {
  if (baseline <= 0) return 0;
  return (baseline - current) / baseline;
}

export function detectPerformanceDrop(
  recentRows: ComercialesDashboardRow[],
  baselineRows: ComercialesDashboardRow[],
  threshold: number,
): AlertCandidate[] {
  const baselineMap = new Map(baselineRows.map((r) => [r.comercialId, r]));
  const alerts: AlertCandidate[] = [];

  for (const recent of recentRows) {
    const baseline = baselineMap.get(recent.comercialId);
    if (!baseline) continue;

    const drops: { metric: MetricKey; current: number; base: number; drop: number }[] = [];

    const metricsToCheck: { key: MetricKey; current: number; base: number }[] = [
      { key: "estimatedRevenueEur", current: recent.estimatedRevenueEur, base: baseline.estimatedRevenueEur },
      { key: "conversionLeadToVisit", current: recent.conversionLeadToVisit, base: baseline.conversionLeadToVisit },
      { key: "conversionVisitToClose", current: recent.conversionVisitToClose, base: baseline.conversionVisitToClose },
      { key: "activity", current: getActivity(recent), base: getActivity(baseline) },
    ];

    for (const m of metricsToCheck) {
      const dropRatio = computeDropRatio(m.current, m.base);
      if (dropRatio >= threshold) {
        drops.push({ metric: m.key, current: m.current, base: m.base, drop: dropRatio });
      }
    }

    if (drops.length === 0) continue;

    const severity: AlertSeverity = drops.length >= 2 ? "high" : "medium";
    const droppedMetrics = drops.map((d) => METRIC_LABELS[d.metric]).join(", ");
    const worstDrop = Math.max(...drops.map((d) => d.drop));

    alerts.push({
      comercialId: recent.comercialId,
      comercialNombre: recent.comercialNombre,
      type: "drop",
      severity,
      metric: drops.map((d) => d.metric).join(","),
      message: `Caída de rendimiento sostenida (2 semanas): ${droppedMetrics}. Peor caída: -${Math.round(worstDrop * 100)}%`,
      currentValue: drops[0].current,
      baselineValue: drops[0].base,
      threshold,
      details: {
        drops: drops.map((d) => ({
          metric: d.metric,
          label: METRIC_LABELS[d.metric],
          current: Math.round(d.current * 100) / 100,
          baseline: Math.round(d.base * 100) / 100,
          dropPercent: Math.round(d.drop * 100),
        })),
      },
    });
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// 2. SLA breach consolidation
// ---------------------------------------------------------------------------

interface SlaBreachRow {
  comercialId: string;
  comercialNombre: string;
  count: number;
}

export async function detectSlaBreaches(
  now: Date,
  slaLostLeadThreshold: number,
): Promise<AlertCandidate[]> {
  const alerts: AlertCandidate[] = [];
  const noFollowUpHours = getLeadNoFollowUpThresholdHours();
  const leadCutoff = new Date(now.getTime() - noFollowUpHours * 60 * 60 * 1000);

  const leadSlaRows = await prisma.$queryRaw<SlaBreachRow[]>`
    SELECT
      f."assignedComercialId" AS "comercialId",
      c.nombre AS "comercialNombre",
      COUNT(*)::int AS "count"
    FROM "commercial_lead_facts" f
    JOIN "comerciales" c ON c.id = f."assignedComercialId"
    WHERE f."assignedComercialId" IS NOT NULL
      AND f."contactedAt" IS NULL
      AND f."createdAt" < ${leadCutoff}
    GROUP BY f."assignedComercialId", c.nombre
    HAVING COUNT(*) >= ${slaLostLeadThreshold}
  `;

  for (const row of leadSlaRows) {
    alerts.push({
      comercialId: row.comercialId,
      comercialNombre: row.comercialNombre,
      type: "sla_breach",
      severity: "medium",
      metric: "lead_contact_sla",
      message: `${row.count} leads sin contactar (SLA > ${noFollowUpHours}h)`,
      currentValue: row.count,
      baselineValue: null,
      threshold: slaLostLeadThreshold,
      details: { slaType: "lead_contact", noFollowUpHours, leadCount: row.count },
    });
  }

  const firmaSlaRows = await prisma.$queryRaw<SlaBreachRow[]>`
    SELECT
      o."comercialId",
      COALESCE(c.nombre, '') AS "comercialNombre",
      COUNT(DISTINCT sr.id)::int AS "count"
    FROM "signature_requests" sr
    JOIN "commercial_operation_facts" o
      ON (o."operacionId" IS NOT NULL AND o."operacionId" = sr."operationId")
      OR (o."operacionId" IS NULL AND o."propertyCode" = sr."propertyCode")
    LEFT JOIN "comerciales" c ON c.id = o."comercialId"
    WHERE sr.status IN ('SENT', 'OPENED')
      AND sr."slaDeadline" < ${now}
      AND o."comercialId" IS NOT NULL
    GROUP BY o."comercialId", c.nombre
  `;

  for (const row of firmaSlaRows) {
    if (row.count === 0) continue;
    alerts.push({
      comercialId: row.comercialId,
      comercialNombre: row.comercialNombre,
      type: "sla_breach",
      severity: "high",
      metric: "firma_sla",
      message: `${row.count} firma(s) pendiente(s) con SLA vencido`,
      currentValue: row.count,
      baselineValue: null,
      threshold: null,
      details: { slaType: "firma_digital", pendingCount: row.count },
    });
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// 3. Deviation from team average (z-score based)
// ---------------------------------------------------------------------------

function computeStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function computeMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

type DeviationMetricKey = "conversionLeadToVisit" | "conversionVisitToClose" | "revenuePerLeadAssignedEur" | "lostLeadRate";

const DEVIATION_METRIC_LABELS: Record<DeviationMetricKey, string> = {
  conversionLeadToVisit: "Conversión lead→visita",
  conversionVisitToClose: "Conversión visita→cierre",
  revenuePerLeadAssignedEur: "Revenue/lead",
  lostLeadRate: "Tasa de leads perdidos",
};

export function detectTeamDeviation(
  rows: ComercialesDashboardRow[],
  zScoreThreshold: number,
  minLeads: number,
): AlertCandidate[] {
  const eligible = rows.filter((r) => r.leadsAssigned >= minLeads);
  if (eligible.length < 2) return [];

  const alerts: AlertCandidate[] = [];

  const metrics: { key: DeviationMetricKey; invertedBad: boolean }[] = [
    { key: "conversionLeadToVisit", invertedBad: false },
    { key: "conversionVisitToClose", invertedBad: false },
    { key: "revenuePerLeadAssignedEur", invertedBad: false },
    { key: "lostLeadRate", invertedBad: true },
  ];

  for (const { key, invertedBad } of metrics) {
    const values = eligible.map((r) => r[key]);
    const mean = computeMean(values);
    const stdDev = computeStdDev(values);
    if (stdDev === 0) continue;

    for (const row of eligible) {
      const value = row[key];
      const zScore = (value - mean) / stdDev;

      const isBad = invertedBad ? zScore > zScoreThreshold : zScore < -zScoreThreshold;
      if (!isBad) continue;

      const existing = alerts.find(
        (a) => a.comercialId === row.comercialId && a.type === "deviation",
      );

      if (existing) {
        const existingMetrics = (existing.details.deviatingMetrics as string[]) || [];
        existingMetrics.push(key);
        existing.details.deviatingMetrics = existingMetrics;
        existing.severity = existingMetrics.length >= 2 ? "high" : "medium";
        existing.metric = existingMetrics.join(",");
        existing.message = `Desviación significativa vs media del equipo: ${existingMetrics.map((m) => DEVIATION_METRIC_LABELS[m as DeviationMetricKey]).join(", ")}`;
        continue;
      }

      alerts.push({
        comercialId: row.comercialId,
        comercialNombre: row.comercialNombre,
        type: "deviation",
        severity: "medium",
        metric: key,
        message: `Desviación significativa vs media del equipo: ${DEVIATION_METRIC_LABELS[key]}`,
        currentValue: Math.round(value * 100) / 100,
        baselineValue: Math.round(mean * 100) / 100,
        threshold: zScoreThreshold,
        details: {
          deviatingMetrics: [key],
          zScore: Math.round(Math.abs(zScore) * 100) / 100,
          mean: Math.round(mean * 100) / 100,
          stdDev: Math.round(stdDev * 100) / 100,
        },
      });
    }
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Deduplication: skip alerts that already exist recently
// ---------------------------------------------------------------------------

async function deduplicateAlerts(
  candidates: AlertCandidate[],
  windowDays: number,
  now: Date,
): Promise<AlertCandidate[]> {
  if (candidates.length === 0) return [];

  const windowStart = daysAgo(windowDays, now);

  const recentAlerts = await prisma.dashboardAlert.findMany({
    where: {
      createdAt: { gte: windowStart },
      resolvedAt: null,
    },
    select: {
      comercialId: true,
      type: true,
      metric: true,
    },
  });

  const recentKeys = new Set(
    recentAlerts.map((a) => `${a.comercialId}:${a.type}:${a.metric}`),
  );

  return candidates.filter(
    (c) => !recentKeys.has(`${c.comercialId}:${c.type}:${c.metric}`),
  );
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function scanDashboardAlerts(
  now = new Date(),
): Promise<ScanResult> {
  const config = getAlertConfig();
  const minLeads = envInt("CLASSIFY_MIN_LEADS", 3);

  const recentRange: DashboardDateRange = {
    from: daysAgo(14, now),
    to: now,
  };
  const baselineRange: DashboardDateRange = {
    from: daysAgo(42, now),
    to: daysAgo(14, now),
  };

  const [recentData, baselineData] = await Promise.all([
    getComercialesDashboard(recentRange),
    getComercialesDashboard(baselineRange),
  ]);

  const dropAlerts = detectPerformanceDrop(
    recentData.rows,
    baselineData.rows,
    config.dropThreshold,
  );

  const slaAlerts = await detectSlaBreaches(now, config.slaLostLeadThreshold);

  const deviationAlerts = detectTeamDeviation(
    recentData.rows,
    config.deviationZScore,
    minLeads,
  );

  const allCandidates = [...dropAlerts, ...slaAlerts, ...deviationAlerts];
  const totalBeforeDedup = allCandidates.length;
  const deduplicated = await deduplicateAlerts(allCandidates, config.deduplicationWindowDays, now);

  return {
    alerts: deduplicated,
    dropCount: dropAlerts.length,
    slaCount: slaAlerts.length,
    deviationCount: deviationAlerts.length,
    deduplicatedCount: totalBeforeDedup - deduplicated.length,
  };
}
