import { beforeEach, describe, expect, it, vi } from "vitest";

const mockQueryRaw = vi.fn();
const mockExpenseAggregate = vi.fn();
const mockExpenseGroupBy = vi.fn();
const mockIncomeAggregate = vi.fn();
const mockTreasuryFindUnique = vi.fn();

vi.mock("@/lib/dashboard/comercial/queries", () => ({
  getCommissionRate: () => 0.02,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
    expense: {
      aggregate: (...args: unknown[]) => mockExpenseAggregate(...args),
      groupBy: (...args: unknown[]) => mockExpenseGroupBy(...args),
    },
    incomeEntry: {
      aggregate: (...args: unknown[]) => mockIncomeAggregate(...args),
    },
    treasuryBalance: {
      findUnique: (...args: unknown[]) => mockTreasuryFindUnique(...args),
    },
  },
}));

import {
  getMonthCash,
  getMonthEbitda,
  getMonthExpensesAggregate,
  getMonthIncomeAggregate,
} from "../aggregator";

describe("finance aggregator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("agrega gastos por tipo y categoría", async () => {
    mockExpenseAggregate.mockResolvedValueOnce({ _sum: { amount: "130.50" } });
    mockExpenseGroupBy
      .mockResolvedValueOnce([
        { costType: "FIJO", _sum: { amount: "80.25" } },
        { costType: "VARIABLE", _sum: { amount: "50.25" } },
      ])
      .mockResolvedValueOnce([
        { bucket: "FACTURA", _sum: { amount: "80.25" }, _count: { id: 2 } },
        { bucket: "GASTO_VARIABLE", _sum: { amount: "50.25" }, _count: { id: 3 } },
      ])
      .mockResolvedValueOnce([
        { category: "software", _sum: { amount: "80.25" }, _count: { id: 2 } },
        { category: "transporte", _sum: { amount: "50.25" }, _count: { id: 3 } },
      ]);

    const result = await getMonthExpensesAggregate("2026-05");
    expect(result).toEqual({
      total: 130.5,
      fixed: 80.25,
      variable: 50.25,
      byBucket: [
        { bucket: "FACTURA", totalAmount: 80.25, totalCount: 2 },
        { bucket: "GASTO_VARIABLE", totalAmount: 50.25, totalCount: 3 },
      ],
      byCategory: [
        { category: "software", totalAmount: 80.25, totalCount: 2 },
        { category: "transporte", totalAmount: 50.25, totalCount: 3 },
      ],
    });
  });

  it("calcula ingresos, EBITDA y cash con saldo inicial", async () => {
    mockQueryRaw.mockResolvedValue([{ estimatedRevenueEur: 1000 }]);
    mockIncomeAggregate.mockResolvedValue({ _sum: { amount: "200.00" } });
    mockExpenseAggregate.mockResolvedValue({ _sum: { amount: "300.00" } });
    mockExpenseGroupBy.mockImplementation((args: { by: string[] }) => {
      if (args.by[0] === "costType") {
        return Promise.resolve([
          { costType: "FIJO", _sum: { amount: "150.00" } },
          { costType: "VARIABLE", _sum: { amount: "150.00" } },
        ]);
      }
      if (args.by[0] === "bucket") {
        return Promise.resolve([
          { bucket: "FACTURA", _sum: { amount: "150.00" }, _count: { id: 1 } },
          { bucket: "GASTO_VARIABLE", _sum: { amount: "150.00" }, _count: { id: 1 } },
        ]);
      }
      return Promise.resolve([]);
    });
    mockTreasuryFindUnique.mockResolvedValue({ openingBalanceEur: "500.00" });

    const income = await getMonthIncomeAggregate("2026-05");
    const ebitda = await getMonthEbitda("2026-05");
    const cash = await getMonthCash("2026-05");

    expect(income).toEqual({ derived: 1000, manual: 200, total: 1200 });
    expect(ebitda).toBe(900);
    expect(cash).toBe(1400);
  });
});
