import type { FinanceBudgetBucket } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const FINANCE_BUDGET_BUCKETS: FinanceBudgetBucket[] = [
  "INGRESOS",
  "FACTURA",
  "SUSCRIPCION",
  "GASTO_VARIABLE",
  "AHORRO",
  "DEUDA",
];

function previousPeriod(period: string): string {
  const [yearRaw, monthRaw] = period.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const base = new Date(Date.UTC(year, month - 1, 1));
  const prev = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - 1, 1),
  );
  const prevYear = prev.getUTCFullYear();
  const prevMonth = String(prev.getUTCMonth() + 1).padStart(2, "0");
  return `${prevYear}-${prevMonth}`;
}

export async function ensureMonthlyBudgetForPeriod(period: string) {
  const existing = await prisma.monthlyBudget.findMany({
    where: { period },
    orderBy: { bucket: "asc" },
  });
  if (existing.length > 0) {
    return existing;
  }

  const prev = await prisma.monthlyBudget.findMany({
    where: { period: previousPeriod(period) },
    orderBy: { bucket: "asc" },
  });

  const seedRows =
    prev.length > 0
      ? prev.map((row) => ({
          period,
          bucket: row.bucket,
          budgetEur: row.budgetEur,
        }))
      : FINANCE_BUDGET_BUCKETS.map((bucket) => ({
          period,
          bucket,
          budgetEur: 0,
        }));

  await prisma.monthlyBudget.createMany({
    data: seedRows,
    skipDuplicates: true,
  });

  return prisma.monthlyBudget.findMany({
    where: { period },
    orderBy: { bucket: "asc" },
  });
}

export async function listMonthlyBudgets(period: string) {
  return ensureMonthlyBudgetForPeriod(period);
}

export async function upsertMonthlyBudget(input: {
  period: string;
  bucket: FinanceBudgetBucket;
  budgetEur: number;
}) {
  return prisma.monthlyBudget.upsert({
    where: {
      period_bucket: {
        period: input.period,
        bucket: input.bucket,
      },
    },
    update: { budgetEur: input.budgetEur },
    create: {
      period: input.period,
      bucket: input.bucket,
      budgetEur: input.budgetEur,
    },
  });
}

export async function bulkUpsertMonthlyBudgets(
  period: string,
  rows: Array<{ bucket: FinanceBudgetBucket; budgetEur: number }>,
) {
  await prisma.$transaction(
    rows.map((row) =>
      prisma.monthlyBudget.upsert({
        where: {
          period_bucket: {
            period,
            bucket: row.bucket,
          },
        },
        update: { budgetEur: row.budgetEur },
        create: {
          period,
          bucket: row.bucket,
          budgetEur: row.budgetEur,
        },
      }),
    ),
  );

  return prisma.monthlyBudget.findMany({
    where: { period },
    orderBy: { bucket: "asc" },
  });
}
