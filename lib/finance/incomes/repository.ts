import { prisma } from "@/lib/prisma";

type IncomePayload = {
  period: string;
  occurredAt: Date;
  amount: number;
  currency?: string;
  source: string;
  description: string;
  accountId?: string | null;
  createdByUserId?: string | null;
};

export async function listIncomeEntries(period?: string) {
  return prisma.incomeEntry.findMany({
    where: period ? { period } : undefined,
    include: {
      account: {
        select: {
          id: true,
          name: true,
          bankName: true,
        },
      },
    },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: 300,
  });
}

export async function createIncomeEntry(payload: IncomePayload) {
  return prisma.incomeEntry.create({
    data: {
      period: payload.period,
      occurredAt: payload.occurredAt,
      amount: payload.amount,
      currency: payload.currency ?? "EUR",
      source: payload.source,
      description: payload.description,
      accountId: payload.accountId ?? null,
      createdByUserId: payload.createdByUserId ?? null,
    },
  });
}

export async function updateIncomeEntry(
  id: string,
  payload: Partial<Omit<IncomePayload, "createdByUserId">>,
) {
  return prisma.incomeEntry.update({
    where: { id },
    data: payload,
  });
}

export async function deleteIncomeEntry(id: string) {
  await prisma.incomeEntry.delete({ where: { id } });
}
