import { prisma } from "@/lib/prisma";
import type {
  SnapshotStatusResult,
  SnapshotPeriodStatus,
  CeoSnapshotFields,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers de fecha
// ---------------------------------------------------------------------------

function toPeriod(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function periodLabel(period: string): string {
  const [year, month] = period.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Lógica de "tiene datos"
// Un snapshot se considera vacío si no existe o todos sus campos clave son 0.
// ---------------------------------------------------------------------------

type SnapshotRow = {
  ebitdaEur: number;
  operatingCostEur: number;
  cashAvailableEur: number;
  fixedCostsEur: number;
  variableCostsEur: number;
} | null;

function isSnapshotEmpty(snapshot: SnapshotRow): boolean {
  if (!snapshot) return true;
  return (
    snapshot.ebitdaEur === 0 &&
    snapshot.operatingCostEur === 0 &&
    snapshot.cashAvailableEur === 0 &&
    snapshot.fixedCostsEur === 0 &&
    snapshot.variableCostsEur === 0
  );
}

async function buildPeriodStatus(period: string): Promise<SnapshotPeriodStatus> {
  const snapshot = await prisma.ceoMonthlySnapshot.findUnique({
    where: { period },
    select: {
      ebitdaEur: true,
      operatingCostEur: true,
      cashAvailableEur: true,
      fixedCostsEur: true,
      variableCostsEur: true,
    },
  });
  return {
    period,
    hasData: !isSnapshotEmpty(snapshot),
    label: periodLabel(period),
  };
}

// ---------------------------------------------------------------------------
// checkSnapshotStatus — verifica mes actual y mes anterior
// ---------------------------------------------------------------------------

export async function checkSnapshotStatus(
  now = new Date(),
): Promise<SnapshotStatusResult> {
  const currentPeriod = toPeriod(now);
  const prevDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  );
  const previousPeriod = toPeriod(prevDate);

  const [current, previous] = await Promise.all([
    buildPeriodStatus(currentPeriod),
    buildPeriodStatus(previousPeriod),
  ]);

  return {
    current,
    previous,
    needsData: !current.hasData || !previous.hasData,
  };
}

// ---------------------------------------------------------------------------
// getCeoSnapshotByPeriod — lectura completa de un periodo
// ---------------------------------------------------------------------------

export async function getCeoSnapshotByPeriod(period: string) {
  return prisma.ceoMonthlySnapshot.findUnique({ where: { period } });
}

// ---------------------------------------------------------------------------
// upsertCeoSnapshot — crea o actualiza el snapshot de un periodo
// ---------------------------------------------------------------------------

export interface SnapshotUpsertData extends CeoSnapshotFields {
  period: string;
}

export async function upsertCeoSnapshot(data: SnapshotUpsertData) {
  const fields = {
    ebitdaEur: data.ebitdaEur,
    operatingCostEur: data.operatingCostEur,
    cashAvailableEur: data.cashAvailableEur,
    fixedCostsEur: data.fixedCostsEur,
    variableCostsEur: data.variableCostsEur,
    reinvestmentCapacity: data.reinvestmentCapacity,
  };

  return prisma.ceoMonthlySnapshot.upsert({
    where: { period: data.period },
    update: fields,
    create: { period: data.period, ...fields },
  });
}
