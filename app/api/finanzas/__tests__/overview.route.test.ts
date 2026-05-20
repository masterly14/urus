import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSessionFromRequest = vi.fn();
const mockGetMonthIncomeAggregate = vi.fn();
const mockGetMonthExpensesAggregate = vi.fn();
const mockGetMonthEbitda = vi.fn();
const mockGetMonthCash = vi.fn();
const mockListMonthlyBudgets = vi.fn();
const mockTreasuryFindUnique = vi.fn();
const mockSnapshotFindUnique = vi.fn();
const mockOperacionCount = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  getSessionFromRequest: (...args: unknown[]) => mockSessionFromRequest(...args),
  isCeoOrAdmin: (role: string) => role === "ceo" || role === "admin",
  unauthorized: () => new Response("unauthorized", { status: 401 }),
  forbidden: () => new Response("forbidden", { status: 403 }),
}));

vi.mock("@/lib/finance", () => ({
  getMonthIncomeAggregate: (...args: unknown[]) => mockGetMonthIncomeAggregate(...args),
  getMonthExpensesAggregate: (...args: unknown[]) => mockGetMonthExpensesAggregate(...args),
  getMonthEbitda: (...args: unknown[]) => mockGetMonthEbitda(...args),
  getMonthCash: (...args: unknown[]) => mockGetMonthCash(...args),
  listMonthlyBudgets: (...args: unknown[]) => mockListMonthlyBudgets(...args),
  FINANCE_BUDGET_BUCKETS: [
    "INGRESOS",
    "FACTURA",
    "SUSCRIPCION",
    "GASTO_VARIABLE",
    "AHORRO",
    "DEUDA",
  ],
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    treasuryBalance: {
      findUnique: (...args: unknown[]) => mockTreasuryFindUnique(...args),
    },
    ceoMonthlySnapshot: {
      findUnique: (...args: unknown[]) => mockSnapshotFindUnique(...args),
    },
    operacion: {
      count: (...args: unknown[]) => mockOperacionCount(...args),
    },
  },
}));

import { GET } from "../overview/route";

describe("GET /api/finanzas/overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionFromRequest.mockResolvedValue({ userId: "u1", role: "ceo" });
    mockGetMonthIncomeAggregate.mockResolvedValue({ derived: 1000, manual: 150, total: 1150 });
    mockGetMonthExpensesAggregate.mockResolvedValue({
      total: 500,
      fixed: 350,
      variable: 150,
      byBucket: [
        { bucket: "FACTURA", totalAmount: 300, totalCount: 2 },
        { bucket: "SUSCRIPCION", totalAmount: 100, totalCount: 1 },
        { bucket: "GASTO_VARIABLE", totalAmount: 80, totalCount: 2 },
        { bucket: "AHORRO", totalAmount: 10, totalCount: 1 },
        { bucket: "DEUDA", totalAmount: 10, totalCount: 1 },
      ],
      byCategory: [],
    });
    mockListMonthlyBudgets.mockResolvedValue([
      { bucket: "INGRESOS", budgetEur: "1300.00" },
      { bucket: "FACTURA", budgetEur: "300.00" },
      { bucket: "SUSCRIPCION", budgetEur: "100.00" },
      { bucket: "GASTO_VARIABLE", budgetEur: "120.00" },
      { bucket: "AHORRO", budgetEur: "50.00" },
      { bucket: "DEUDA", budgetEur: "40.00" },
    ]);
    mockGetMonthEbitda.mockResolvedValue(650);
    mockGetMonthCash.mockResolvedValue(1250);
    mockTreasuryFindUnique.mockResolvedValue({ openingBalanceEur: "600", notes: "inicial" });
    mockSnapshotFindUnique.mockResolvedValue({ reinvestmentCapacity: 450 });
    mockOperacionCount.mockResolvedValue(4);
  });

  it("devuelve overview agregado del periodo", async () => {
    const res = await GET(new Request("https://app.local/api/finanzas/overview?period=2026-05"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.period).toBe("2026-05");
    expect(json.expenses.total).toBe(500);
    expect(json.income.total).toBe(1150);
    expect(json.ebitda).toBe(650);
    expect(json.cash).toBe(1250);
    expect(json.openingBalanceDeclared).toBe(true);
    expect(json.budgetRows).toHaveLength(6);
    expect(json.remaining).toBe(650);
  });
});
