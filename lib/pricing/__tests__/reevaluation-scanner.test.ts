import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPropertyCurrentFindMany = vi.fn();
const mockEventFindFirst = vi.fn();
const mockEventCount = vi.fn();
const mockQueryRaw = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    propertyCurrent: { findMany: (...args: unknown[]) => mockPropertyCurrentFindMany(...args) },
    event: {
      findFirst: (...args: unknown[]) => mockEventFindFirst(...args),
      count: (...args: unknown[]) => mockEventCount(...args),
    },
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
  },
}));

const mockEnqueueJob = vi.fn();
vi.mock("@/lib/job-queue", () => ({
  enqueueJob: (...args: unknown[]) => mockEnqueueJob(...args),
}));

import {
  scanPropertiesForPricingReevaluation,
  DAYS_WITHOUT_LEADS,
  MIN_VISITS_WITHOUT_OFFER,
  COOLDOWN_DAYS,
  STAGGER_MS,
  MAX_PROPERTIES_PER_SCAN,
  REEVAL_MAX_PAGES,
  REEVAL_GENERATE_RECOMMENDATION,
} from "../reevaluation-scanner";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProperty(
  codigo: string,
  ageDays: number,
  overrides: Record<string, unknown> = {},
) {
  const createdAt = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000);
  const fechaAlta = createdAt.toISOString().slice(0, 19).replace("T", " ");
  return { codigo, fechaAlta, createdAt, ...overrides };
}

/**
 * Configura mocks para una propiedad con condiciones específicas:
 * - recentAnalysis: si tiene PRICING_ANALISIS_GENERADO reciente
 * - matchCount: número de MATCH_GENERADO
 * - visitCount: número de VISITA_EVALUADA con propertyCode
 * - hasOffer: si tiene ESTADO_CAMBIADO a Reserva/Arras
 */
function setupPropertyMocks(opts: {
  recentAnalysis?: boolean;
  matchCount?: number;
  visitCount?: number;
  hasOffer?: boolean;
}) {
  mockEventFindFirst.mockResolvedValue(
    opts.recentAnalysis ? { id: "evt-recent" } : null,
  );

  mockEventCount.mockResolvedValue(opts.matchCount ?? 0);

  // $queryRaw se usa para visitas (1er call) y ofertas (2do call).
  // Con template literals Prisma pasa el SQL como primer arg.
  const visitResult = [{ count: opts.visitCount ?? 0 }];
  const offerResult = [{ count: opts.hasOffer ? 1 : 0 }];

  mockQueryRaw.mockImplementation((...args: unknown[]) => {
    const sql = Array.isArray(args[0]) ? (args[0] as string[])[0] ?? "" : String(args[0] ?? "");
    if (sql.includes("VISITA_EVALUADA")) return Promise.resolve(visitResult);
    if (sql.includes("ESTADO_CAMBIADO")) return Promise.resolve(offerResult);
    return Promise.resolve([{ count: 0 }]);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEnqueueJob.mockResolvedValue({ id: "job-mock" });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("scanPropertiesForPricingReevaluation", () => {
  it("Trigger A: encola propiedad sin leads con edad >= 14 días", async () => {
    mockPropertyCurrentFindMany.mockResolvedValue([
      makeProperty("PROP-A1", DAYS_WITHOUT_LEADS + 5),
    ]);
    setupPropertyMocks({ recentAnalysis: false, matchCount: 0 });

    const result = await scanPropertiesForPricingReevaluation();

    expect(result.enqueuedNoLeads).toBe(1);
    expect(mockEnqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "RUN_PRICING_ANALYSIS",
        payload: expect.objectContaining({
          propertyCode: "PROP-A1",
          trigger: "no_leads_reeval",
          maxPages: REEVAL_MAX_PAGES,
          generateRecommendation: REEVAL_GENERATE_RECOMMENDATION,
        }),
      }),
    );
  });

  it("Trigger A: NO encola propiedad sin leads si edad < 14 días", async () => {
    mockPropertyCurrentFindMany.mockResolvedValue([
      makeProperty("PROP-A2", DAYS_WITHOUT_LEADS - 3),
    ]);
    setupPropertyMocks({ recentAnalysis: false, matchCount: 0 });

    const result = await scanPropertiesForPricingReevaluation();

    expect(result.enqueuedNoLeads).toBe(0);
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("Trigger A: NO encola propiedad que tiene leads (matches > 0)", async () => {
    mockPropertyCurrentFindMany.mockResolvedValue([
      makeProperty("PROP-A3", DAYS_WITHOUT_LEADS + 10),
    ]);
    setupPropertyMocks({ recentAnalysis: false, matchCount: 3 });

    const result = await scanPropertiesForPricingReevaluation();

    expect(result.enqueuedNoLeads).toBe(0);
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("Trigger B: encola propiedad con 3+ visitas sin oferta", async () => {
    mockPropertyCurrentFindMany.mockResolvedValue([
      makeProperty("PROP-B1", 5),
    ]);
    setupPropertyMocks({
      recentAnalysis: false,
      matchCount: 2,
      visitCount: MIN_VISITS_WITHOUT_OFFER,
      hasOffer: false,
    });

    const result = await scanPropertiesForPricingReevaluation();

    expect(result.enqueuedVisitsNoOffer).toBe(1);
    expect(mockEnqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          propertyCode: "PROP-B1",
          trigger: "visits_no_offer_reeval",
        }),
      }),
    );
  });

  it("Trigger B: NO encola si tiene oferta (ESTADO_CAMBIADO a Reserva)", async () => {
    mockPropertyCurrentFindMany.mockResolvedValue([
      makeProperty("PROP-B2", 5),
    ]);
    setupPropertyMocks({
      recentAnalysis: false,
      matchCount: 2,
      visitCount: MIN_VISITS_WITHOUT_OFFER + 2,
      hasOffer: true,
    });

    const result = await scanPropertiesForPricingReevaluation();

    expect(result.enqueuedVisitsNoOffer).toBe(0);
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("Trigger B: NO encola si visitas < umbral", async () => {
    mockPropertyCurrentFindMany.mockResolvedValue([
      makeProperty("PROP-B3", 5),
    ]);
    setupPropertyMocks({
      recentAnalysis: false,
      matchCount: 1,
      visitCount: MIN_VISITS_WITHOUT_OFFER - 1,
      hasOffer: false,
    });

    const result = await scanPropertiesForPricingReevaluation();

    expect(result.enqueuedVisitsNoOffer).toBe(0);
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("cooldown: skip si tiene análisis reciente (< 7 días)", async () => {
    mockPropertyCurrentFindMany.mockResolvedValue([
      makeProperty("PROP-C1", DAYS_WITHOUT_LEADS + 1),
    ]);
    setupPropertyMocks({ recentAnalysis: true, matchCount: 0 });

    const result = await scanPropertiesForPricingReevaluation();

    expect(result.skippedByCooldown).toBe(1);
    expect(result.enqueuedNoLeads).toBe(0);
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("idempotencia: usa idempotencyKey con fecha del día", async () => {
    mockPropertyCurrentFindMany.mockResolvedValue([
      makeProperty("PROP-D1", DAYS_WITHOUT_LEADS + 1),
    ]);
    setupPropertyMocks({ recentAnalysis: false, matchCount: 0 });

    await scanPropertiesForPricingReevaluation();

    const today = new Date().toISOString().slice(0, 10);
    expect(mockEnqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: `pricing-reeval:PROP-D1:${today}`,
      }),
    );
  });

  it("escalonamiento: jobs sucesivos tienen availableAt separados por STAGGER_MS", async () => {
    const props = [
      makeProperty("PROP-E1", DAYS_WITHOUT_LEADS + 1),
      makeProperty("PROP-E2", DAYS_WITHOUT_LEADS + 2),
      makeProperty("PROP-E3", DAYS_WITHOUT_LEADS + 3),
    ];
    mockPropertyCurrentFindMany.mockResolvedValue(props);

    mockEventFindFirst.mockResolvedValue(null);
    mockEventCount.mockResolvedValue(0);
    mockQueryRaw.mockResolvedValue([{ count: 0 }]);

    await scanPropertiesForPricingReevaluation();

    expect(mockEnqueueJob).toHaveBeenCalledTimes(3);

    const calls = mockEnqueueJob.mock.calls;
    const t0 = (calls[0][0].availableAt as Date).getTime();
    const t1 = (calls[1][0].availableAt as Date).getTime();
    const t2 = (calls[2][0].availableAt as Date).getTime();

    expect(t1 - t0).toBeGreaterThanOrEqual(STAGGER_MS - 100);
    expect(t2 - t1).toBeGreaterThanOrEqual(STAGGER_MS - 100);
  });

  it("límite: no encola más de MAX_PROPERTIES_PER_SCAN", async () => {
    const props = Array.from({ length: MAX_PROPERTIES_PER_SCAN + 20 }, (_, i) =>
      makeProperty(`PROP-F${i}`, DAYS_WITHOUT_LEADS + 1),
    );
    mockPropertyCurrentFindMany.mockResolvedValue(props);

    mockEventFindFirst.mockResolvedValue(null);
    mockEventCount.mockResolvedValue(0);
    mockQueryRaw.mockResolvedValue([{ count: 0 }]);

    const result = await scanPropertiesForPricingReevaluation();

    expect(mockEnqueueJob).toHaveBeenCalledTimes(MAX_PROPERTIES_PER_SCAN);
    expect(result.enqueuedNoLeads).toBe(MAX_PROPERTIES_PER_SCAN);
  });

  it("retorna métricas correctas con mezcla de propiedades", async () => {
    const props = [
      makeProperty("PROP-MIX-1", DAYS_WITHOUT_LEADS + 5),
      makeProperty("PROP-MIX-2", DAYS_WITHOUT_LEADS + 1),
      makeProperty("PROP-MIX-3", 3),
    ];
    mockPropertyCurrentFindMany.mockResolvedValue(props);

    // PROP-MIX-1: cooldown (reciente)
    // PROP-MIX-2: sin leads → encolar
    // PROP-MIX-3: joven, sin visitas → no encolar
    mockEventFindFirst
      .mockResolvedValueOnce({ id: "recent" })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    mockEventCount
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1);

    mockQueryRaw.mockResolvedValue([{ count: 0 }]);

    const result = await scanPropertiesForPricingReevaluation();

    expect(result.propertiesScanned).toBe(3);
    expect(result.skippedByCooldown).toBe(1);
    expect(result.enqueuedNoLeads).toBe(1);
    expect(result.enqueuedVisitsNoOffer).toBe(0);
    expect(result.errors).toHaveLength(0);
  });
});
