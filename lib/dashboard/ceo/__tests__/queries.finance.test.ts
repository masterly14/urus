import { beforeEach, describe, expect, it, vi } from "vitest";

const mockQueryRaw = vi.fn();
const mockCeoTargetFindUnique = vi.fn();
const mockCeoSnapshotFindUnique = vi.fn();
const mockComercialCount = vi.fn();
const mockDashboardAlertCount = vi.fn();
const mockComercialAggregate = vi.fn();
const mockOperacionCount = vi.fn();

const mockGetMonthExpensesAggregate = vi.fn();
const mockGetMonthEbitda = vi.fn();
const mockGetMonthCash = vi.fn();

vi.mock("@/lib/dashboard/comercial/queries", () => ({
  getCommissionRate: () => 0.02,
}));

vi.mock("@/lib/finance/aggregator", () => ({
  getMonthExpensesAggregate: (...args: unknown[]) => mockGetMonthExpensesAggregate(...args),
  getMonthEbitda: (...args: unknown[]) => mockGetMonthEbitda(...args),
  getMonthCash: (...args: unknown[]) => mockGetMonthCash(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
    ceoTarget: {
      findUnique: (...args: unknown[]) => mockCeoTargetFindUnique(...args),
    },
    ceoMonthlySnapshot: {
      findUnique: (...args: unknown[]) => mockCeoSnapshotFindUnique(...args),
    },
    comercial: {
      count: (...args: unknown[]) => mockComercialCount(...args),
      aggregate: (...args: unknown[]) => mockComercialAggregate(...args),
    },
    dashboardAlert: {
      count: (...args: unknown[]) => mockDashboardAlertCount(...args),
    },
    operacion: {
      count: (...args: unknown[]) => mockOperacionCount(...args),
    },
  },
}));

import { getCeoOverview } from "../queries";

describe("getCeoOverview (finance derived)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryRaw.mockResolvedValue([
      {
        grossVolumeEur: 100000,
        estimatedRevenueEur: 2000,
        closings: 4,
        avgMarginPerOp: 500,
      },
    ]);
    mockCeoTargetFindUnique.mockResolvedValue({
      targetRevenueEur: 1800,
      year: 2026,
      month: 5,
      id: "t1",
    });
    mockCeoSnapshotFindUnique.mockResolvedValue({
      id: "s1",
      period: "2026-05",
      ebitdaEur: 0,
      operatingCostEur: 0,
      cashAvailableEur: 0,
      reinvestmentCapacity: 900,
    });
    mockComercialCount.mockResolvedValue(8);
    mockDashboardAlertCount.mockResolvedValue(1);
    mockComercialAggregate.mockResolvedValue({ _avg: { cargaActual: 12 } });
    mockOperacionCount.mockResolvedValue(3);

    mockGetMonthExpensesAggregate.mockImplementation(async (period: string) =>
      period === "2026-05"
        ? { total: 700, fixed: 400, variable: 300, byCategory: [] }
        : { total: 500, fixed: 300, variable: 200, byCategory: [] },
    );
    mockGetMonthEbitda.mockImplementation(async (period: string) =>
      period === "2026-05" ? 1300 : 900,
    );
    mockGetMonthCash.mockImplementation(async (period: string) =>
      period === "2026-05" ? 2100 : 1800,
    );
  });

  it("usa agregados financieros para EBITDA, costes y cash", async () => {
    const data = await getCeoOverview(new Date("2026-05-19T12:00:00.000Z"));
    expect(data.kpis.ebitda.value).toBe(1300);
    expect(data.kpis.costeOperativo.value).toBe(700);
    expect(data.kpis.cashDisponible.value).toBe(2100);
    expect(data.kpis.capacidadReinversion.value).toBe(900);
  });
});
