import { prisma } from "@/lib/prisma";

export type DashboardDateRange = {
  from: Date;
  to: Date;
};

export type ComercialesDashboardRow = {
  comercialId: string;
  comercialNombre: string;
  ciudad: string;
  leadsAssigned: number;
  leadsContacted: number;
  leadsLostNoFollowUp: number;
  visits: number;
  closings: number;
  grossVolumeEur: number;
  estimatedRevenueEur: number;
  avgCloseDays: number | null;
  conversionLeadToVisit: number;
  conversionVisitToClose: number;
  revenuePerOperationEur: number;
  revenuePerLeadAssignedEur: number;
  lostLeadRate: number;
};

export type ComercialDashboardDetail = {
  summary: ComercialesDashboardRow | null;
  weekly: Array<{
    weekStart: string;
    leadsAssigned: number;
    visits: number;
    closings: number;
    estimatedRevenueEur: number;
  }>;
  commissionRate: number;
  range: { from: string; to: string };
};

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0));
}

export function getDefaultDashboardRange(now = new Date()): DashboardDateRange {
  const from = startOfMonth(now);
  const to = now;
  return { from, to };
}

export function getCommissionRate(): number {
  const raw = process.env.DASHBOARD_COMMISSION_RATE;
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n >= 0) return n;
  return 0.03;
}

export function getLeadNoFollowUpThresholdHours(): number {
  const raw = process.env.DASHBOARD_LEAD_NO_FOLLOW_UP_HOURS;
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0) return n;
  return 24;
}

export async function getComercialesDashboard(
  range: DashboardDateRange,
  options?: { includeInactive?: boolean },
): Promise<{ rows: ComercialesDashboardRow[]; commissionRate: number; range: { from: string; to: string } }> {
  const commissionRate = getCommissionRate();
  const thresholdHours = getLeadNoFollowUpThresholdHours();
  const leadCutoff = new Date(range.to.getTime() - thresholdHours * 60 * 60 * 1000);
  const includeInactive = Boolean(options?.includeInactive);

  const rows = await prisma.$queryRaw<ComercialesDashboardRow[]>`
    SELECT
      c.id AS "comercialId",
      c.nombre AS "comercialNombre",
      c.ciudad AS "ciudad",
      COALESCE(l.leads_assigned, 0)::int AS "leadsAssigned",
      COALESCE(l.leads_contacted, 0)::int AS "leadsContacted",
      COALESCE(l.leads_lost, 0)::int AS "leadsLostNoFollowUp",
      COALESCE(v.visits, 0)::int AS "visits",
      COALESCE(o.closings, 0)::int AS "closings",
      COALESCE(o.gross_volume, 0)::float8 AS "grossVolumeEur",
      COALESCE(o.estimated_revenue, 0)::float8 AS "estimatedRevenueEur",
      o.avg_days_to_close::float8 AS "avgCloseDays",
      CASE
        WHEN COALESCE(l.leads_assigned, 0) > 0
          THEN COALESCE(v.visits, 0)::float8 / l.leads_assigned
        ELSE 0
      END AS "conversionLeadToVisit",
      CASE
        WHEN COALESCE(v.visits, 0) > 0
          THEN COALESCE(o.closings, 0)::float8 / v.visits
        ELSE 0
      END AS "conversionVisitToClose",
      CASE
        WHEN COALESCE(o.closings, 0) > 0
          THEN COALESCE(o.estimated_revenue, 0)::float8 / o.closings
        ELSE 0
      END AS "revenuePerOperationEur",
      CASE
        WHEN COALESCE(l.leads_assigned, 0) > 0
          THEN COALESCE(o.estimated_revenue, 0)::float8 / l.leads_assigned
        ELSE 0
      END AS "revenuePerLeadAssignedEur",
      CASE
        WHEN COALESCE(l.leads_assigned, 0) > 0
          THEN COALESCE(l.leads_lost, 0)::float8 / l.leads_assigned
        ELSE 0
      END AS "lostLeadRate"
    FROM "comerciales" c
    LEFT JOIN (
      SELECT
        "assignedComercialId" AS comercial_id,
        COUNT(*)::int AS leads_assigned,
        COUNT(*) FILTER (WHERE "contactedAt" IS NOT NULL)::int AS leads_contacted,
        COUNT(*) FILTER (
          WHERE "contactedAt" IS NULL
            AND "createdAt" < ${leadCutoff}
        )::int AS leads_lost
      FROM "commercial_lead_facts"
      WHERE "assignedComercialId" IS NOT NULL
        AND "createdAt" >= ${range.from}
        AND "createdAt" < ${range.to}
      GROUP BY "assignedComercialId"
    ) l ON l.comercial_id = c.id
    LEFT JOIN (
      SELECT
        "comercialId" AS comercial_id,
        COUNT(*)::int AS visits
      FROM "commercial_visit_facts"
      WHERE "comercialId" IS NOT NULL
        AND COALESCE("scheduledAt", "createdAt") >= ${range.from}
        AND COALESCE("scheduledAt", "createdAt") < ${range.to}
      GROUP BY "comercialId"
    ) v ON v.comercial_id = c.id
    LEFT JOIN (
      SELECT
        "comercialId" AS comercial_id,
        COUNT(*)::int AS closings,
        COALESCE(SUM(COALESCE("grossAmountEur", 0)), 0)::float8 AS gross_volume,
        COALESCE(SUM(COALESCE("grossAmountEur", 0) * ${commissionRate}), 0)::float8 AS estimated_revenue,
        AVG("daysToClose")::float8 AS avg_days_to_close
      FROM "commercial_operation_facts"
      WHERE "comercialId" IS NOT NULL
        AND "closedAt" >= ${range.from}
        AND "closedAt" < ${range.to}
      GROUP BY "comercialId"
    ) o ON o.comercial_id = c.id
    WHERE (${includeInactive} OR c.activo = true)
    ORDER BY "estimatedRevenueEur" DESC, "closings" DESC, "visits" DESC, "leadsAssigned" DESC;
  `;

  return {
    rows,
    commissionRate,
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
  };
}

export async function getComercialDashboardDetail(
  comercialId: string,
  range: DashboardDateRange,
): Promise<ComercialDashboardDetail> {
  const commissionRate = getCommissionRate();
  const thresholdHours = getLeadNoFollowUpThresholdHours();
  const leadCutoff = new Date(range.to.getTime() - thresholdHours * 60 * 60 * 1000);

  const summaryRows = await prisma.$queryRaw<ComercialesDashboardRow[]>`
    SELECT
      c.id AS "comercialId",
      c.nombre AS "comercialNombre",
      c.ciudad AS "ciudad",
      COALESCE(l.leads_assigned, 0)::int AS "leadsAssigned",
      COALESCE(l.leads_contacted, 0)::int AS "leadsContacted",
      COALESCE(l.leads_lost, 0)::int AS "leadsLostNoFollowUp",
      COALESCE(v.visits, 0)::int AS "visits",
      COALESCE(o.closings, 0)::int AS "closings",
      COALESCE(o.gross_volume, 0)::float8 AS "grossVolumeEur",
      COALESCE(o.estimated_revenue, 0)::float8 AS "estimatedRevenueEur",
      o.avg_days_to_close::float8 AS "avgCloseDays",
      CASE
        WHEN COALESCE(l.leads_assigned, 0) > 0
          THEN COALESCE(v.visits, 0)::float8 / l.leads_assigned
        ELSE 0
      END AS "conversionLeadToVisit",
      CASE
        WHEN COALESCE(v.visits, 0) > 0
          THEN COALESCE(o.closings, 0)::float8 / v.visits
        ELSE 0
      END AS "conversionVisitToClose",
      CASE
        WHEN COALESCE(o.closings, 0) > 0
          THEN COALESCE(o.estimated_revenue, 0)::float8 / o.closings
        ELSE 0
      END AS "revenuePerOperationEur",
      CASE
        WHEN COALESCE(l.leads_assigned, 0) > 0
          THEN COALESCE(o.estimated_revenue, 0)::float8 / l.leads_assigned
        ELSE 0
      END AS "revenuePerLeadAssignedEur",
      CASE
        WHEN COALESCE(l.leads_assigned, 0) > 0
          THEN COALESCE(l.leads_lost, 0)::float8 / l.leads_assigned
        ELSE 0
      END AS "lostLeadRate"
    FROM "comerciales" c
    LEFT JOIN (
      SELECT
        "assignedComercialId" AS comercial_id,
        COUNT(*)::int AS leads_assigned,
        COUNT(*) FILTER (WHERE "contactedAt" IS NOT NULL)::int AS leads_contacted,
        COUNT(*) FILTER (
          WHERE "contactedAt" IS NULL
            AND "createdAt" < ${leadCutoff}
        )::int AS leads_lost
      FROM "commercial_lead_facts"
      WHERE "assignedComercialId" = ${comercialId}
        AND "createdAt" >= ${range.from}
        AND "createdAt" < ${range.to}
      GROUP BY "assignedComercialId"
    ) l ON l.comercial_id = c.id
    LEFT JOIN (
      SELECT
        "comercialId" AS comercial_id,
        COUNT(*)::int AS visits
      FROM "commercial_visit_facts"
      WHERE "comercialId" = ${comercialId}
        AND COALESCE("scheduledAt", "createdAt") >= ${range.from}
        AND COALESCE("scheduledAt", "createdAt") < ${range.to}
      GROUP BY "comercialId"
    ) v ON v.comercial_id = c.id
    LEFT JOIN (
      SELECT
        "comercialId" AS comercial_id,
        COUNT(*)::int AS closings,
        COALESCE(SUM(COALESCE("grossAmountEur", 0)), 0)::float8 AS gross_volume,
        COALESCE(SUM(COALESCE("grossAmountEur", 0) * ${commissionRate}), 0)::float8 AS estimated_revenue,
        AVG("daysToClose")::float8 AS avg_days_to_close
      FROM "commercial_operation_facts"
      WHERE "comercialId" = ${comercialId}
        AND "closedAt" >= ${range.from}
        AND "closedAt" < ${range.to}
      GROUP BY "comercialId"
    ) o ON o.comercial_id = c.id
    WHERE c.id = ${comercialId}
    LIMIT 1;
  `;

  const summary = summaryRows[0] ?? null;

  const weeklyFrom = new Date(range.to.getTime() - 12 * 7 * 24 * 60 * 60 * 1000);

  const weekly = await prisma.$queryRaw<ComercialDashboardDetail["weekly"]>`
    WITH weeks AS (
      SELECT generate_series(
        date_trunc('week', ${weeklyFrom}::timestamp),
        date_trunc('week', ${range.to}::timestamp),
        interval '1 week'
      ) AS week_start
    ),
    leads AS (
      SELECT
        date_trunc('week', "createdAt") AS week_start,
        COUNT(*)::int AS leads_assigned
      FROM "commercial_lead_facts"
      WHERE "assignedComercialId" = ${comercialId}
        AND "createdAt" >= ${weeklyFrom}
        AND "createdAt" < ${range.to}
      GROUP BY 1
    ),
    visits AS (
      SELECT
        date_trunc('week', COALESCE("scheduledAt", "createdAt")) AS week_start,
        COUNT(*)::int AS visits
      FROM "commercial_visit_facts"
      WHERE "comercialId" = ${comercialId}
        AND COALESCE("scheduledAt", "createdAt") >= ${weeklyFrom}
        AND COALESCE("scheduledAt", "createdAt") < ${range.to}
      GROUP BY 1
    ),
    closings AS (
      SELECT
        date_trunc('week', "closedAt") AS week_start,
        COUNT(*)::int AS closings,
        COALESCE(SUM(COALESCE("grossAmountEur", 0) * ${commissionRate}), 0)::float8 AS estimated_revenue
      FROM "commercial_operation_facts"
      WHERE "comercialId" = ${comercialId}
        AND "closedAt" >= ${weeklyFrom}
        AND "closedAt" < ${range.to}
      GROUP BY 1
    )
    SELECT
      w.week_start::text AS "weekStart",
      COALESCE(l.leads_assigned, 0)::int AS "leadsAssigned",
      COALESCE(v.visits, 0)::int AS "visits",
      COALESCE(c.closings, 0)::int AS "closings",
      COALESCE(c.estimated_revenue, 0)::float8 AS "estimatedRevenueEur"
    FROM weeks w
    LEFT JOIN leads l ON l.week_start = w.week_start
    LEFT JOIN visits v ON v.week_start = w.week_start
    LEFT JOIN closings c ON c.week_start = w.week_start
    ORDER BY w.week_start ASC;
  `;

  return {
    summary,
    weekly,
    commissionRate,
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
  };
}

