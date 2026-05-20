import { prisma } from "@/lib/prisma";

type BankAccountPayload = {
  name: string;
  bankName?: string | null;
  ownerScope?: string;
  accountType?: string;
  isActive?: boolean;
};

export async function listBankAccounts(includeInactive = true) {
  return prisma.bankAccount.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
}

export async function createBankAccount(payload: BankAccountPayload) {
  return prisma.bankAccount.create({
    data: {
      name: payload.name,
      bankName: payload.bankName ?? null,
      ownerScope: payload.ownerScope ?? "EMPRESA",
      accountType: payload.accountType ?? "CORRIENTE",
      isActive: payload.isActive ?? true,
    },
  });
}

export async function updateBankAccount(
  id: string,
  payload: Partial<BankAccountPayload>,
) {
  return prisma.bankAccount.update({
    where: { id },
    data: {
      ...(payload.name ? { name: payload.name } : {}),
      ...(Object.prototype.hasOwnProperty.call(payload, "bankName")
        ? { bankName: payload.bankName ?? null }
        : {}),
      ...(payload.ownerScope ? { ownerScope: payload.ownerScope } : {}),
      ...(payload.accountType ? { accountType: payload.accountType } : {}),
      ...(typeof payload.isActive === "boolean" ? { isActive: payload.isActive } : {}),
    },
  });
}

export async function deleteBankAccount(id: string) {
  await prisma.bankAccount.delete({ where: { id } });
}
