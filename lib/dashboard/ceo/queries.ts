import { prisma } from "@/lib/prisma";
import { getCommissionRate } from "@/lib/dashboard/comercial/queries";
import type {
  KpiValue,
  CeoSemaforos,
  CeoOperacionesResumen,
  CeoEquipoResumen,
  HistoricoEntry,
  CeoOverviewPayload,
} from "./types";
import {
  evaluarSemaforoFacturacion,
  evaluarSemaforoEquipo,
  evaluarSemaforoExpansion,
  evaluarSemaforoCostes,
} from "./thresholds";

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function toPeriod(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function prevMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
}

function buildKpi(
  current: number,
  previous: number | null,
): KpiValue {
  const changePercent =
    previous != null && previous !== 0
      ? ((current - previous) / Math.abs(previous)) * 100
      : null;
  return { value: current, previousValue: previous, changePercent };
}

// ---------------------------------------------------------------------------
// Derived revenue from CommercialOperationFact (same pattern as M10 queries)
// ---------------------------------------------------------------------------

interface RevenueRow {
  grossVolumeEur: number;
  estimatedRevenueEur: number;
  closings: number;
  avgMarginPerOp: number;
}

async function getDerivedRevenue(from: Date, to: Date): Promise<RevenueRow> {
  const commissionRate = getCommissionRate();
  const rows = await prisma.$queryRaw<RevenueRow[]>`
    SELECT
      COALESCE(SUM(COALESCE("grossAmountEur", 0)), 0)::float8 AS "grossVolumeEur",
      COALESCE(SUM(COALESCE("grossAmountEur", 0) * ${commissionRate}), 0)::float8 AS "estimatedRevenueEur",
      COUNT(*)::int AS "closings",
      CASE
        WHEN COUNT(*) > 0
          THEN (COALESCE(SUM(COALESCE("grossAmountEur", 0) * ${commissionRate}), 0) / COUNT(*))::float8
        ELSE 0
      END AS "avgMarginPerOp"
    FROM "commercial_operation_facts"
    WHERE "closedAt" >= ${from}
      AND "closedAt" < ${to};
  `;
  return rows[0] ?? { grossVolumeEur: 0, estimatedRevenueEur: 0, closings: 0, avgMarginPerOp: 0 };
}

// ---------------------------------------------------------------------------
// Monthly snapshot (manual/persisted data)
// ---------------------------------------------------------------------------

async function getMonthlySnapshot(period: string) {
  return prisma.ceoMonthlySnapshot.findUnique({ where: { period } });
}

// ---------------------------------------------------------------------------
// Target for a specific month (falls back to annual target if no monthly)
// ---------------------------------------------------------------------------

async function getTarget(year: number, month: number) {
  const monthly = await prisma.ceoTarget.findUnique({
    where: { year_month: { year, month } },
  });
  if (monthly) return monthly;
  return prisma.ceoTarget.findUnique({
    where: { year_month: { year, month: 0 } },
  });
}

// ---------------------------------------------------------------------------
// Equipo resumen
// ---------------------------------------------------------------------------

async function getEquipoResumen(): Promise<CeoEquipoResumen> {
  const [comercialesActivos, alertasAbiertas, cargaMedia] = await Promise.all([
    prisma.comercial.count({ where: { activo: true } }),
    prisma.dashboardAlert.count({ where: { resolvedAt: null } }),
    prisma.comercial
      .aggregate({ where: { activo: true }, _avg: { cargaActual: true } })
      .then((r) => r._avg.cargaActual ?? 0),
  ]);
  return { comercialesActivos, alertasAbiertas, cargaMedia };
}

// ---------------------------------------------------------------------------
// Operaciones resumen
// ---------------------------------------------------------------------------

async function getOperacionesResumen(
  monthFrom: Date,
  monthTo: Date,
): Promise<CeoOperacionesResumen> {
  const [activas, cerradasMes] = await Promise.all([
    prisma.operacion.count({
      where: { estado: { notIn: ["CERRADA_VENTA", "CERRADA_ALQUILER", "CERRADA_TRASPASO", "CANCELADA"] } },
    }),
    prisma.operacion.count({
      where: {
        closedAt: { gte: monthFrom, lt: monthTo },
        estado: { in: ["CERRADA_VENTA", "CERRADA_ALQUILER", "CERRADA_TRASPASO"] },
      },
    }),
  ]);
  return { activas, cerradasMes };
}

// ---------------------------------------------------------------------------
// Histórico (últimos N meses)
// ---------------------------------------------------------------------------

async function getHistorico(months: number, now: Date): Promise<HistoricoEntry[]> {
  const entries: HistoricoEntry[] = [];
  const commissionRate = getCommissionRate();

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const period = toPeriod(d);
    const from = startOfMonth(d);
    const to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));

    const [snapshot, target, revenue] = await Promise.all([
      getMonthlySnapshot(period),
      getTarget(d.getUTCFullYear(), d.getUTCMonth() + 1),
      getDerivedRevenue(from, to),
    ]);

    entries.push({
      period,
      revenueEur: revenue.estimatedRevenueEur,
      targetRevenueEur: target?.targetRevenueEur ?? 0,
      ebitdaEur: snapshot?.ebitdaEur ?? 0,
      operatingCostEur: snapshot?.operatingCostEur ?? 0,
      cashAvailableEur: snapshot?.cashAvailableEur ?? 0,
    });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

export async function getCeoOverview(
  now = new Date(),
): Promise<CeoOverviewPayload> {
  const currentPeriod = toPeriod(now);
  const prevDate = prevMonth(now);
  const prevPeriodStr = toPeriod(prevDate);

  const monthFrom = startOfMonth(now);
  const monthTo = now;
  const prevFrom = startOfMonth(prevDate);
  const prevTo = new Date(Date.UTC(prevDate.getUTCFullYear(), prevDate.getUTCMonth() + 1, 1));

  const quarterFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));

  const [
    currentRevenue,
    prevRevenue,
    quarterRevenue,
    currentSnapshot,
    prevSnapshot,
    target,
    equipo,
    operaciones,
    historico,
  ] = await Promise.all([
    getDerivedRevenue(monthFrom, monthTo),
    getDerivedRevenue(prevFrom, prevTo),
    getDerivedRevenue(quarterFrom, monthTo),
    getMonthlySnapshot(currentPeriod),
    getMonthlySnapshot(prevPeriodStr),
    getTarget(now.getUTCFullYear(), now.getUTCMonth() + 1),
    getEquipoResumen(),
    getOperacionesResumen(monthFrom, monthTo),
    getHistorico(6, now),
  ]);

  const kpis: CeoOverviewPayload["kpis"] = {
    facturacionMensual: buildKpi(
      currentRevenue.estimatedRevenueEur,
      prevRevenue.estimatedRevenueEur,
    ),
    facturacionTrimestral: buildKpi(
      quarterRevenue.estimatedRevenueEur,
      null,
    ),
    ebitda: buildKpi(
      currentSnapshot?.ebitdaEur ?? 0,
      prevSnapshot?.ebitdaEur ?? null,
    ),
    costeOperativo: buildKpi(
      currentSnapshot?.operatingCostEur ?? 0,
      prevSnapshot?.operatingCostEur ?? null,
    ),
    margenPorOperacion: buildKpi(
      currentRevenue.avgMarginPerOp,
      prevRevenue.avgMarginPerOp,
    ),
    cashDisponible: buildKpi(
      currentSnapshot?.cashAvailableEur ?? 0,
      prevSnapshot?.cashAvailableEur ?? null,
    ),
    capacidadReinversion: buildKpi(
      currentSnapshot?.reinvestmentCapacity ?? 0,
      prevSnapshot?.reinvestmentCapacity ?? null,
    ),
  };

  const semaforos: CeoSemaforos = {
    facturacion: evaluarSemaforoFacturacion(
      currentRevenue.estimatedRevenueEur,
      target?.targetRevenueEur ?? 0,
    ),
    equipo: evaluarSemaforoEquipo(
      equipo.alertasAbiertas,
      equipo.comercialesActivos,
      equipo.cargaMedia,
    ),
    expansion: evaluarSemaforoExpansion(
      currentSnapshot?.cashAvailableEur ?? 0,
      currentRevenue.avgMarginPerOp,
      currentRevenue.estimatedRevenueEur,
      target?.targetRevenueEur ?? 0,
    ),
    costes: evaluarSemaforoCostes(
      currentSnapshot?.operatingCostEur ?? 0,
      currentRevenue.estimatedRevenueEur,
    ),
  };

  return { kpis, semaforos, operaciones, equipo, historico };
}
