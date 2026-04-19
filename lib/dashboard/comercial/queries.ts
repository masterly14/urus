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
  /**
   * Facturación estimada por semana en las últimas `SPARKLINE_WEEKS` semanas
   * (ordenadas antigua → reciente, longitud fija, padded con 0).
   * Solo se rellena en `getComercialesDashboard`; es undefined en contextos
   * donde no se calcula la tendencia (p. ej. detalle individual).
   */
  weeklyRevenue?: number[];
};

/**
 * Número de semanas incluidas en el sparkline de tendencia por comercial.
 * Se define como constante exportable por si otros consumidores (tests, UI)
 * necesitan asumir la misma longitud.
 */
export const SPARKLINE_WEEKS = 6;

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

/**
 * Devuelve la facturación estimada por comercial × semana durante las últimas
 * `SPARKLINE_WEEKS` semanas (incluida la semana de `range.to`).
 *
 * Usa `date_trunc('week', ...)` (ISO week, lunes 00:00) consistente con el resto
 * de queries del dashboard. `CROSS JOIN weeks` garantiza que cada comercial
 * tenga exactamente `SPARKLINE_WEEKS` entradas, rellenando con 0 los huecos.
 */
async function getWeeklyRevenueByComercial(
  sparklineEnd: Date,
  commissionRate: number,
  includeInactive: boolean,
): Promise<Map<string, number[]>> {
  const sparklineStart = new Date(
    sparklineEnd.getTime() - (SPARKLINE_WEEKS - 1) * 7 * 24 * 60 * 60 * 1000,
  );

  type RawRow = {
    comercialId: string;
    weekStart: string;
    estimatedRevenueEur: number;
  };

  const rows = await prisma.$queryRaw<RawRow[]>`
    WITH weeks AS (
      SELECT generate_series(
        date_trunc('week', ${sparklineStart}::timestamp),
        date_trunc('week', ${sparklineEnd}::timestamp),
        interval '1 week'
      ) AS week_start
    )
    SELECT
      c.id AS "comercialId",
      w.week_start::text AS "weekStart",
      COALESCE(SUM(COALESCE(o."grossAmountEur", 0) * ${commissionRate}), 0)::float8
        AS "estimatedRevenueEur"
    FROM "comerciales" c
    CROSS JOIN weeks w
    LEFT JOIN "commercial_operation_facts" o
      ON o."comercialId" = c.id
      AND date_trunc('week', o."closedAt") = w.week_start
    WHERE (${includeInactive} OR c.activo = true)
    GROUP BY c.id, w.week_start
    ORDER BY c.id, w.week_start ASC;
  `;

  const map = new Map<string, number[]>();
  for (const row of rows) {
    const arr = map.get(row.comercialId) ?? [];
    arr.push(Number(row.estimatedRevenueEur) || 0);
    map.set(row.comercialId, arr);
  }

  for (const [id, arr] of map) {
    if (arr.length < SPARKLINE_WEEKS) {
      while (arr.length < SPARKLINE_WEEKS) arr.push(0);
      map.set(id, arr);
    } else if (arr.length > SPARKLINE_WEEKS) {
      map.set(id, arr.slice(-SPARKLINE_WEEKS));
    }
  }

  return map;
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

  const weeklyMap = await getWeeklyRevenueByComercial(
    range.to,
    commissionRate,
    includeInactive,
  );

  const emptyTrend = new Array(SPARKLINE_WEEKS).fill(0);
  const enrichedRows: ComercialesDashboardRow[] = rows.map((r) => ({
    ...r,
    weeklyRevenue: weeklyMap.get(r.comercialId) ?? emptyTrend.slice(),
  }));

  return {
    rows: enrichedRows,
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

// ---------------------------------------------------------------------------
// Lead-score stats per comercial (for classification hot-lead bias)
// ---------------------------------------------------------------------------

export type LeadScoreStatsRow = {
  comercialId: string;
  totalLeads: number;
  highScoreLeads: number;
  contactedTotal: number;
  contactedHighScore: number;
};

export async function getLeadScoreStatsByComercial(
  range: DashboardDateRange,
): Promise<LeadScoreStatsRow[]> {
  return prisma.$queryRaw<LeadScoreStatsRow[]>`
    WITH score_p75 AS (
      SELECT COALESCE(
        percentile_cont(0.75) WITHIN GROUP (ORDER BY score),
        0
      )::int AS threshold
      FROM "commercial_lead_facts"
      WHERE score IS NOT NULL
        AND "assignedComercialId" IS NOT NULL
        AND "createdAt" >= ${range.from}
        AND "createdAt" < ${range.to}
    )
    SELECT
      f."assignedComercialId" AS "comercialId",
      COUNT(*)::int AS "totalLeads",
      COUNT(*) FILTER (WHERE f.score >= sp.threshold AND sp.threshold > 0)::int AS "highScoreLeads",
      COUNT(*) FILTER (WHERE f."contactedAt" IS NOT NULL)::int AS "contactedTotal",
      COUNT(*) FILTER (
        WHERE f."contactedAt" IS NOT NULL
          AND f.score >= sp.threshold
          AND sp.threshold > 0
      )::int AS "contactedHighScore"
    FROM "commercial_lead_facts" f
    CROSS JOIN score_p75 sp
    WHERE f."assignedComercialId" IS NOT NULL
      AND f."createdAt" >= ${range.from}
      AND f."createdAt" < ${range.to}
    GROUP BY f."assignedComercialId";
  `;
}

