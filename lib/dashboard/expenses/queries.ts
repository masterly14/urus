import { prisma } from "@/lib/prisma";

type ExpenseFilters = {
  period?: string | null;
  from?: string | null;
  to?: string | null;
  category?: string | null;
  status?: string | null;
  costType?: string | null;
  bucket?: string | null;
  accountId?: string | null;
};

function parseDateOrNull(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
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

function periodBounds(period?: string | null): { from: Date; to: Date } | null {
  if (!period) return null;
  const [yearRaw, monthRaw] = period.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 1));
  return { from, to };
}

function buildWhere(filters: ExpenseFilters) {
  const bounds = periodBounds(filters.period);
  const from = parseDateOrNull(filters.from);
  const to = parseDateOrNull(filters.to);
  return {
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.status ? { status: filters.status as never } : {}),
    ...(filters.costType ? { costType: filters.costType as never } : {}),
    ...(filters.bucket ? { bucket: filters.bucket as never } : {}),
    ...(filters.accountId ? { accountId: filters.accountId } : {}),
    ...(bounds
      ? {
          expenseDate: {
            gte: bounds.from,
            lt: bounds.to,
          },
        }
      : from || to
      ? {
          expenseDate: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
  };
}

export async function getExpenses(filters: ExpenseFilters) {
  const expenses = await prisma.expense.findMany({
    where: buildWhere(filters),
    include: {
      account: {
        select: {
          id: true,
          name: true,
          bankName: true,
        },
      },
      attachments: {
        select: {
          id: true,
          mediaType: true,
          mimeType: true,
          filename: true,
          cloudinaryUrl: true,
          createdAt: true,
        },
      },
    },
    orderBy: { expenseDate: "desc" },
    take: 200,
  });

  return expenses.map((expense) => ({
    ...expense,
    amount: toNumber(expense.amount),
  }));
}

export async function getExpensesSummary(filters: ExpenseFilters) {
  const where = buildWhere(filters);

  const [total, statusGroups, bucketGroups, categoryGroups] = await Promise.all([
    prisma.expense.aggregate({
      where,
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.expense.groupBy({
      by: ["status"],
      where,
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.expense.groupBy({
      by: ["bucket"],
      where,
      _sum: { amount: true },
      _count: { id: true },
      orderBy: { _sum: { amount: "desc" } },
    }),
    prisma.expense.groupBy({
      by: ["category"],
      where,
      _sum: { amount: true },
      _count: { id: true },
      orderBy: { _sum: { amount: "desc" } },
      take: 20,
    }),
  ]);

  return {
    totalAmount: toNumber(total._sum.amount),
    totalCount: total._count.id,
    byStatus: statusGroups.map((row) => ({
      status: row.status,
      totalAmount: toNumber(row._sum.amount),
      totalCount: row._count.id,
    })),
    byBucket: bucketGroups.map((row) => ({
      bucket: row.bucket,
      totalAmount: toNumber(row._sum.amount),
      totalCount: row._count.id,
    })),
    byCategory: categoryGroups.map((row) => ({
      category: row.category,
      totalAmount: toNumber(row._sum.amount),
      totalCount: row._count.id,
    })),
  };
}
