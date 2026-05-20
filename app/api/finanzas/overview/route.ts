import { NextResponse } from "next/server";
import {
  forbidden,
  getSessionFromRequest,
  isCeoOrAdmin,
  unauthorized,
} from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import {
  FINANCE_BUDGET_BUCKETS,
  listMonthlyBudgets,
  getMonthCash,
  getMonthEbitda,
  getMonthExpensesAggregate,
  getMonthIncomeAggregate,
} from "@/lib/finance";
import { prisma } from "@/lib/prisma";

function currentPeriod(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function periodBounds(period: string): { from: Date; to: Date } {
  const [yearRaw, monthRaw] = period.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 1));
  return { from, to };
}

const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

  const url = new URL(request.url);
  const period = url.searchParams.get("period") ?? currentPeriod();

  try {
    const { from, to } = periodBounds(period);
    const [income, expenses, budgets, ebitda, cash, treasury, snapshot, closedOperations] = await Promise.all([
      getMonthIncomeAggregate(period),
      getMonthExpensesAggregate(period),
      listMonthlyBudgets(period),
      getMonthEbitda(period),
      getMonthCash(period),
      prisma.treasuryBalance.findUnique({
        where: { period },
        select: { openingBalanceEur: true, notes: true, updatedAt: true },
      }),
      prisma.ceoMonthlySnapshot.findUnique({
        where: { period },
        select: { reinvestmentCapacity: true },
      }),
      prisma.operacion.count({
        where: {
          closedAt: { gte: from, lt: to },
          estado: { in: ["CERRADA_VENTA", "CERRADA_ALQUILER", "CERRADA_TRASPASO"] },
        },
      }),
    ]);

    const realByBucket = new Map<string, number>();
    realByBucket.set("INGRESOS", income.total);
    for (const row of expenses.byBucket) {
      realByBucket.set(row.bucket, row.totalAmount);
    }

    const budgetByBucket = new Map<string, number>();
    for (const row of budgets) {
      budgetByBucket.set(row.bucket, Number(row.budgetEur));
    }

    const budgetRows = FINANCE_BUDGET_BUCKETS.map((bucket) => {
      const budgetEur = budgetByBucket.get(bucket) ?? 0;
      const realEur = realByBucket.get(bucket) ?? 0;
      return {
        bucket,
        budgetEur,
        realEur,
        deltaEur: realEur - budgetEur,
      };
    });

    const remaining = income.total - expenses.total;
    const budgetIncome = budgetByBucket.get("INGRESOS") ?? 0;
    const budgetOutflow = FINANCE_BUDGET_BUCKETS.filter((bucket) => bucket !== "INGRESOS")
      .map((bucket) => budgetByBucket.get(bucket) ?? 0)
      .reduce((sum, value) => sum + value, 0);
    const remainingBudget = budgetIncome - budgetOutflow;

    return NextResponse.json({
      ok: true,
      period,
      income,
      expenses,
      ebitda,
      cash,
      openingBalanceDeclared: treasury != null,
      openingBalanceEur: treasury?.openingBalanceEur != null ? Number(treasury.openingBalanceEur) : 0,
      treasuryNotes: treasury?.notes ?? null,
      reinvestmentCapacity: snapshot?.reinvestmentCapacity ?? 0,
      closedOperations,
      budgetRows,
      remaining,
      remainingBudget,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[api/finanzas/overview] GET failed:", message);
    return NextResponse.json(
      { ok: false, error: "No se pudo generar el overview financiero" },
      { status: 500 },
    );
  }
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/finanzas/overview" },
  getHandler,
);
