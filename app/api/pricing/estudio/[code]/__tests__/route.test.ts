import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockGetReport } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetReport: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionFromRequest: (...args: unknown[]) => mockGetSession(...args),
  unauthorized: () => new Response("unauthorized", { status: 401 }),
}));

vi.mock("@/lib/pricing/cached-queries", () => ({
  getCachedPricingReport: (...args: unknown[]) => mockGetReport(...args),
}));

vi.mock("@/lib/observability", () => ({
  withObservedRoute: (_meta: unknown, handler: unknown) => handler,
}));

describe("GET /api/pricing/estudio/[code]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      userId: "user-1",
      role: "admin",
    });
  });

  it("devuelve 404 cuando no hay estudio materializado", async () => {
    mockGetReport.mockResolvedValue(null);
    const { GET } = await import("../route");
    const response = await GET(
      new Request("http://localhost/api/pricing/estudio/P-1"),
      { params: Promise.resolve({ code: "P-1" }) },
    );
    expect(response.status).toBe(404);
  });

  it("expone optimalPricing y zoneStudy cuando existe informe", async () => {
    mockGetReport.mockResolvedValue({
      propertyCode: "P-1",
      analyzedAt: "2026-05-21T00:00:00.000Z",
      input: { propertyCode: "P-1" },
      stats: { semaforo: "verde" },
      optimalPricing: { recommendedMinPrice: 210000, recommendedMaxPrice: 225000 },
      zoneStudy: { demographicsSummary: { densityBucket: "alta" } },
      comparabilityProfile: { zoneCode: "COR-IMV-1" },
    });

    const { GET } = await import("../route");
    const response = await GET(
      new Request("http://localhost/api/pricing/estudio/P-1"),
      { params: Promise.resolve({ code: "P-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.optimalPricing.recommendedMinPrice).toBe(210000);
    expect(body.zoneStudy.demographicsSummary.densityBucket).toBe("alta");
  });
});
