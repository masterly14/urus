import { prisma } from "@/lib/prisma";

type TreasuryBalancePayload = {
  period: string;
  openingBalanceEur: number;
  notes?: string | null;
  updatedByUserId?: string | null;
};

export async function getTreasuryBalance(period: string) {
  return prisma.treasuryBalance.findUnique({
    where: { period },
  });
}

export async function listTreasuryBalances(limit = 12) {
  return prisma.treasuryBalance.findMany({
    orderBy: { period: "desc" },
    take: limit,
  });
}

export async function upsertTreasuryBalance(payload: TreasuryBalancePayload) {
  return prisma.treasuryBalance.upsert({
    where: { period: payload.period },
    update: {
      openingBalanceEur: payload.openingBalanceEur,
      notes: payload.notes ?? null,
      updatedByUserId: payload.updatedByUserId ?? null,
    },
    create: {
      period: payload.period,
      openingBalanceEur: payload.openingBalanceEur,
      notes: payload.notes ?? null,
      updatedByUserId: payload.updatedByUserId ?? null,
    },
  });
}

export async function deleteTreasuryBalance(id: string) {
  await prisma.treasuryBalance.delete({ where: { id } });
}
