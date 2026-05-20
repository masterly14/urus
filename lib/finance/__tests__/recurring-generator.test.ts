import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindMany = vi.fn();
const mockFindUnique = vi.fn();
const mockExpenseCreate = vi.fn();
const mockRecurringUpdate = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    recurringExpense: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      update: (...args: unknown[]) => mockRecurringUpdate(...args),
    },
    expense: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      create: (...args: unknown[]) => mockExpenseCreate(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

import { generateRecurringExpensesForDate } from "@/lib/finance/recurring/generator";

describe("generateRecurringExpensesForDate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([
      {
        id: "rec_1",
        name: "Idealista",
        vendor: "IDEALISTA",
        amountEur: "647.47",
        dayOfMonth: 5,
        category: "marketing",
        bucket: "FACTURA",
        accountId: null,
        active: true,
        lastGeneratedPeriod: null,
      },
    ]);
    mockFindUnique.mockResolvedValue(null);
    mockExpenseCreate.mockReturnValue({ op: "create" });
    mockRecurringUpdate.mockReturnValue({ op: "update" });
    mockTransaction.mockResolvedValue([]);
  });

  it("genera expected gastos y marca periodo", async () => {
    const result = await generateRecurringExpensesForDate(
      new Date("2026-05-05T12:00:00.000Z"),
    );

    expect(result).toMatchObject({ period: "2026-05", day: 5, created: 1, skipped: 0 });
    expect(mockExpenseCreate).toHaveBeenCalledTimes(1);
    expect(mockRecurringUpdate).toHaveBeenCalledTimes(1);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it("salta registro si ya existe el sourceMessageId sintético", async () => {
    mockFindUnique.mockResolvedValueOnce({ id: "exp-existing" });

    const result = await generateRecurringExpensesForDate(
      new Date("2026-05-05T12:00:00.000Z"),
    );

    expect(result).toMatchObject({ created: 0, skipped: 1 });
    expect(mockExpenseCreate).toHaveBeenCalledTimes(0);
    expect(mockRecurringUpdate).toHaveBeenCalledTimes(1);
  });
});
