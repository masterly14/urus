import { prisma } from "@/lib/prisma";

type RecurringExpensePayload = {
  name: string;
  vendor: string;
  amountEur: number;
  dayOfMonth: number;
  category: string;
  bucket: "FACTURA" | "SUSCRIPCION" | "GASTO_VARIABLE" | "AHORRO" | "DEUDA";
  accountId?: string | null;
  active?: boolean;
};

export async function listRecurringExpenses() {
  return prisma.recurringExpense.findMany({
    include: {
      account: {
        select: {
          id: true,
          name: true,
          bankName: true,
        },
      },
    },
    orderBy: [{ active: "desc" }, { dayOfMonth: "asc" }, { name: "asc" }],
  });
}

export async function createRecurringExpense(payload: RecurringExpensePayload) {
  return prisma.recurringExpense.create({
    data: {
      name: payload.name,
      vendor: payload.vendor,
      amountEur: payload.amountEur,
      dayOfMonth: payload.dayOfMonth,
      category: payload.category,
      bucket: payload.bucket,
      accountId: payload.accountId ?? null,
      active: payload.active ?? true,
    },
  });
}

export async function updateRecurringExpense(
  id: string,
  payload: Partial<RecurringExpensePayload & { lastGeneratedPeriod: string | null }>,
) {
  return prisma.recurringExpense.update({
    where: { id },
    data: {
      ...(payload.name ? { name: payload.name } : {}),
      ...(payload.vendor ? { vendor: payload.vendor } : {}),
      ...(payload.amountEur != null ? { amountEur: payload.amountEur } : {}),
      ...(payload.dayOfMonth != null ? { dayOfMonth: payload.dayOfMonth } : {}),
      ...(payload.category ? { category: payload.category } : {}),
      ...(payload.bucket ? { bucket: payload.bucket } : {}),
      ...(Object.prototype.hasOwnProperty.call(payload, "accountId")
        ? { accountId: payload.accountId ?? null }
        : {}),
      ...(typeof payload.active === "boolean" ? { active: payload.active } : {}),
      ...(Object.prototype.hasOwnProperty.call(payload, "lastGeneratedPeriod")
        ? { lastGeneratedPeriod: payload.lastGeneratedPeriod ?? null }
        : {}),
    },
  });
}

export async function deleteRecurringExpense(id: string) {
  await prisma.recurringExpense.delete({ where: { id } });
}
