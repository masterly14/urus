import { prisma } from "@/lib/prisma";
import { getCommissionRate } from "@/lib/dashboard/comercial/queries";

type ExpenseCategoryAggregate = {
  category: string;
  totalAmount: number;
  totalCount: number;
};

type ExpenseBucketAggregate = {
  bucket: "FACTURA" | "SUSCRIPCION" | "GASTO_VARIABLE" | "AHORRO" | "DEUDA";
  totalAmount: number;
  totalCount: number;
};

export type MonthExpensesAggregate = {
  total: number;
  fixed: number;
  variable: number;
  byBucket: ExpenseBucketAggregate[];
  byCategory: ExpenseCategoryAggregate[];
};

export type MonthIncomeAggregate = {
  derived: number;
  manual: number;
  total: number;
};

function parsePeriod(period: string): Date {
  const [yearRaw, monthRaw] = period.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Periodo inválido: ${period}`);
  }
  return new Date(Date.UTC(year, month - 1, 1));
}

function getPeriodBounds(period: string): { from: Date; to: Date } {
  const from = parsePeriod(period);
  const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
  return { from, to };
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === "bigint") return Number(value);
  if (value && typeof value === "object") {
    const withToString = value as { toString?: () => string };
    if (typeof withToString.toString === "function") {
      const parsed = Number(withToString.toString());
      return Number.isFinite(parsed) ? parsed : 0;
    }
  }
  return 0;
}

async function getDerivedIncomeForPeriod(period: string): Promise<number> {
  const { from, to } = getPeriodBounds(period);
  const commissionRate = getCommissionRate();
  const rows = await prisma.$queryRaw<{ estimatedRevenueEur: number }[]>`
    SELECT
      COALESCE(SUM(COALESCE("grossAmountEur", 0) * ${commissionRate}), 0)::float8 AS "estimatedRevenueEur"
    FROM "commercial_operation_facts"
    WHERE "closedAt" >= ${from}
      AND "closedAt" < ${to};
  `;
  return rows[0]?.estimatedRevenueEur ?? 0;
}

export async function getMonthExpensesAggregate(period: string): Promise<MonthExpensesAggregate> {
  const { from, to } = getPeriodBounds(period);
  const expenseWhere = {
    status: "CONFIRMED" as const,
    expenseDate: {
      gte: from,
      lt: to,
    },
  };

  const [total, byCostType, byBucket, byCategory] = await Promise.all([
    prisma.expense.aggregate({
      where: expenseWhere,
      _sum: { amount: true },
    }),
    prisma.expense.groupBy({
      by: ["costType"],
      where: expenseWhere,
      _sum: { amount: true },
    }),
    prisma.expense.groupBy({
      by: ["bucket"],
      where: expenseWhere,
      _sum: { amount: true },
      _count: { id: true },
      orderBy: { _sum: { amount: "desc" } },
    }),
    prisma.expense.groupBy({
      by: ["category"],
      where: expenseWhere,
      _sum: { amount: true },
      _count: { id: true },
      orderBy: { _sum: { amount: "desc" } },
    }),
  ]);

  const fixed = byCostType.find((row) => row.costType === "FIJO");
  const variable = byCostType.find((row) => row.costType === "VARIABLE");

  return {
    total: toNumber(total._sum.amount),
    fixed: toNumber(fixed?._sum.amount),
    variable: toNumber(variable?._sum.amount),
    byBucket: byBucket.map((row) => ({
      bucket: row.bucket,
      totalAmount: toNumber(row._sum.amount),
      totalCount: row._count.id,
    })),
    byCategory: byCategory.map((row) => ({
      category: row.category,
      totalAmount: toNumber(row._sum.amount),
      totalCount: row._count.id,
    })),
  };
}

export async function getMonthIncomeAggregate(period: string): Promise<MonthIncomeAggregate> {
  const [derived, manual] = await Promise.all([
    getDerivedIncomeForPeriod(period),
    prisma.incomeEntry.aggregate({
      where: { period },
      _sum: { amount: true },
    }),
  ]);

  const manualAmount = toNumber(manual._sum.amount);
  return {
    derived,
    manual: manualAmount,
    total: derived + manualAmount,
  };
}

export async function getMonthEbitda(period: string): Promise<number> {
  const [income, expenses] = await Promise.all([
    getMonthIncomeAggregate(period),
    getMonthExpensesAggregate(period),
  ]);
  return income.total - expenses.total;
}

export async function getMonthCash(period: string): Promise<number> {
  const [income, expenses, treasury] = await Promise.all([
    getMonthIncomeAggregate(period),
    getMonthExpensesAggregate(period),
    prisma.treasuryBalance.findUnique({
      where: { period },
      select: { openingBalanceEur: true },
    }),
  ]);
  return toNumber(treasury?.openingBalanceEur) + income.total - expenses.total;
}
