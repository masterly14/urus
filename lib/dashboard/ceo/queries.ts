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
import {
  getMonthCash,
  getMonthEbitda,
  getMonthExpensesAggregate,
} from "@/lib/finance/aggregator";

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

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const period = toPeriod(d);
    const from = startOfMonth(d);
    const to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));

    const [target, revenue, expenses, ebitda, cash] = await Promise.all([
      getTarget(d.getUTCFullYear(), d.getUTCMonth() + 1),
      getDerivedRevenue(from, to),
      getMonthExpensesAggregate(period),
      getMonthEbitda(period),
      getMonthCash(period),
    ]);

    entries.push({
      period,
      revenueEur: revenue.estimatedRevenueEur,
      targetRevenueEur: target?.targetRevenueEur ?? 0,
      ebitdaEur: ebitda,
      operatingCostEur: expenses.total,
      cashAvailableEur: cash,
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
    currentExpenses,
    prevExpenses,
    currentEbitda,
    prevEbitda,
    currentCash,
    prevCash,
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
    getMonthExpensesAggregate(currentPeriod),
    getMonthExpensesAggregate(prevPeriodStr),
    getMonthEbitda(currentPeriod),
    getMonthEbitda(prevPeriodStr),
    getMonthCash(currentPeriod),
    getMonthCash(prevPeriodStr),
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
      currentEbitda,
      prevEbitda,
    ),
    costeOperativo: buildKpi(
      currentExpenses.total,
      prevExpenses.total,
    ),
    margenPorOperacion: buildKpi(
      currentRevenue.avgMarginPerOp,
      prevRevenue.avgMarginPerOp,
    ),
    cashDisponible: buildKpi(
      currentCash,
      prevCash,
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
      currentCash,
      currentRevenue.avgMarginPerOp,
      currentRevenue.estimatedRevenueEur,
      target?.targetRevenueEur ?? 0,
    ),
    costes: evaluarSemaforoCostes(
      currentExpenses.total,
      currentRevenue.estimatedRevenueEur,
    ),
  };

  logCeoOverviewDataSources({
    now,
    currentPeriod,
    prevPeriodStr,
    monthFrom,
    monthTo,
    prevFrom,
    prevTo,
    quarterFrom,
    commissionRate: getCommissionRate(),
    currentRevenue,
    prevRevenue,
    quarterRevenue,
    currentSnapshot,
    prevSnapshot,
    currentExpenses,
    prevExpenses,
    currentEbitda,
    prevEbitda,
    currentCash,
    prevCash,
    target,
    kpis,
  });

  return { kpis, semaforos, operaciones, equipo, historico };
}

/** Traza en consola del servidor el origen de cada KPI (útil al depurar p. ej. 28K € de EBITDA). */
function logCeoOverviewDataSources(ctx: {
  now: Date;
  currentPeriod: string;
  prevPeriodStr: string;
  monthFrom: Date;
  monthTo: Date;
  prevFrom: Date;
  prevTo: Date;
  quarterFrom: Date;
  commissionRate: number;
  currentRevenue: RevenueRow;
  prevRevenue: RevenueRow;
  quarterRevenue: RevenueRow;
  currentSnapshot: Awaited<ReturnType<typeof getMonthlySnapshot>>;
  prevSnapshot: Awaited<ReturnType<typeof getMonthlySnapshot>>;
  currentExpenses: Awaited<ReturnType<typeof getMonthExpensesAggregate>>;
  prevExpenses: Awaited<ReturnType<typeof getMonthExpensesAggregate>>;
  currentEbitda: number;
  prevEbitda: number;
  currentCash: number;
  prevCash: number;
  target: Awaited<ReturnType<typeof getTarget>>;
  kpis: CeoOverviewPayload["kpis"];
}): void {
  const {
    now,
    currentPeriod,
    prevPeriodStr,
    monthFrom,
    monthTo,
    prevFrom,
    prevTo,
    quarterFrom,
    commissionRate,
    currentRevenue,
    prevRevenue,
    quarterRevenue,
    currentSnapshot,
    prevSnapshot,
    currentExpenses,
    prevExpenses,
    currentEbitda,
    prevEbitda,
    currentCash,
    prevCash,
    target,
    kpis,
  } = ctx;

  // Solo en desarrollo para no llenar logs en producción
  if (process.env.NODE_ENV === "production") return;

  const snap = (s: typeof currentSnapshot, label: string) =>
    s
      ? `${label}: tabla ceo_monthly_snapshots id=${s.id} period=${s.period} (ebitdaEur=${s.ebitdaEur}, operatingCostEur=${s.operatingCostEur}, cashAvailableEur=${s.cashAvailableEur}, reinvestmentCapacity=${s.reinvestmentCapacity})`
      : `${label}: null (sin fila en ceo_monthly_snapshots para ese periodo → KPIs manuales en 0)`;

  const tgt = target
    ? `CeoTarget id=${target.id} year=${target.year} month=${target.month ?? "anual"} targetRevenueEur=${target.targetRevenueEur}`
    : "CeoTarget: null";

  console.log("\n[ceo/overview] ─── Origen de datos (servidor) ───");
  console.log(`  now (UTC): ${now.toISOString()}`);
  console.log(`  periodo KPI mensuales: ${currentPeriod} | mes anterior: ${prevPeriodStr}`);
  console.log(
    `  Facturación mensual ${kpis.facturacionMensual.value.toFixed(2)} € → tabla commercial_operation_facts: SUM(grossAmountEur)*${commissionRate} con closedAt ∈ [${monthFrom.toISOString()}, ${monthTo.toISOString()}) | closings=${currentRevenue.closings}`,
  );
  console.log(
    `  Mes anterior facturación: ${prevRevenue.estimatedRevenueEur.toFixed(2)} € | closedAt ∈ [${prevFrom.toISOString()}, ${prevTo.toISOString()})`,
  );
  console.log(
    `  Facturación trimestral: ${kpis.facturacionTrimestral.value.toFixed(2)} € | mismo criterio, rango [${quarterFrom.toISOString()}, ${monthTo.toISOString()})`,
  );
  console.log(`  EBITDA ${kpis.ebitda.value.toFixed(2)} € → derivado: ingresos del periodo - gastos confirmados (actual=${currentEbitda.toFixed(2)} | mes anterior=${prevEbitda.toFixed(2)})`);
  console.log(
    `  Coste operativo ${kpis.costeOperativo.value.toFixed(2)} € → agregado de gastos confirmados (actual=${currentExpenses.total.toFixed(2)} [fijos=${currentExpenses.fixed.toFixed(2)} variables=${currentExpenses.variable.toFixed(2)}] | anterior=${prevExpenses.total.toFixed(2)})`,
  );
  console.log(`  Cash ${kpis.cashDisponible.value.toFixed(2)} € → openingBalance + ingresos - gastos (actual=${currentCash.toFixed(2)} | anterior=${prevCash.toFixed(2)})`);
  console.log(`  Cap. reinversión ${kpis.capacidadReinversion.value.toFixed(2)} € → ceo_monthly_snapshots.reinvestmentCapacity`);
  console.log(`  Margen/op: ${kpis.margenPorOperacion.value.toFixed(2)} € → derivado: facturación estimada / nº cierres (commercial_operation_facts)`);
  console.log(`  Objetivo facturación (semáforo): ${target?.targetRevenueEur ?? 0} | ${tgt}`);
  console.log(`  Snapshot actual (solo trazabilidad/capacidad reinversión): ${snap(currentSnapshot, "snapshot actual")}`);
  console.log(`  Snapshot anterior (solo trazabilidad): ${snap(prevSnapshot, "snapshot anterior")}`);
  console.log("[ceo/overview] ──────────────────────────────\n");
}
