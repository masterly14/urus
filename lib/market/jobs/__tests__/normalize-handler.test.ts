import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  findManyMock,
  updateRawMock,
  findUniqueListingMock,
  updateListingMock,
  createListingMock,
  findUniqueRunMock,
} = vi.hoisted(() => ({
  findManyMock: vi.fn(),
  updateRawMock: vi.fn(),
  findUniqueListingMock: vi.fn(),
  updateListingMock: vi.fn(),
  createListingMock: vi.fn(),
  findUniqueRunMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    marketRawListing: {
      findMany: findManyMock,
      update: updateRawMock,
    },
    marketListing: {
      findUnique: findUniqueListingMock,
      update: updateListingMock,
      create: createListingMock,
    },
    marketCrawlRun: {
      findUnique: findUniqueRunMock,
    },
  },
}));

import { handleMarketNormalizeBatch } from "../normalize-handler";
import type { JobRecord } from "@/lib/job-queue/types";

function makeJob(payload: Record<string, unknown> = {}): JobRecord {
  return {
    id: "job-norm-1",
    type: "MARKET_NORMALIZE_BATCH",
    status: "IN_PROGRESS",
    payload: payload as JobRecord["payload"],
    priority: 100,
    attempts: 1,
    maxAttempts: 3,
    availableAt: new Date(),
    lockedAt: new Date(),
    lockedBy: "test",
    startedAt: new Date(),
    completedAt: null,
    failedAt: null,
    lastError: null,
    idempotencyKey: null,
    sourceEventId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeFotocasaRaw(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "raw-fc-1",
    source: "source_a" as const,
    externalId: "188063260",
    canonicalUrl:
      "https://www.fotocasa.es/es/comprar/vivienda/cordoba-capital/aire-acondicionado-ascensor/188063260/d",
    crawlRunId: "run-1",
    httpStatus: 200,
    contentHash: "abc123",
    payload: {
      title: "Piso en venta",
      priceRaw: "175.000 €",
      surfaceRaw: "85 m²",
      roomsRaw: "3",
      cityRaw: "cordoba",
      housingRaw: "piso",
      operationRaw: "venta",
      rawText: "Piso 85 m² 3 hab",
      imageUrls: ["https://img.example.com/1.jpg"],
      mainImageUrl: "https://img.example.com/1.jpg",
    },
    status: "CAPTURED" as const,
    rejectionReason: null,
    capturedAt: new Date("2026-05-06T10:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  findUniqueRunMock.mockResolvedValue({
    id: "run-1",
    seed: { city: "cordoba", zone: null, source: "source_a" },
  });
  findUniqueListingMock.mockResolvedValue(null);
  createListingMock.mockResolvedValue({ id: "listing-new-1" });
  updateRawMock.mockResolvedValue({});
  updateListingMock.mockResolvedValue({});
});

describe("handleMarketNormalizeBatch", () => {
  it("no-op cuando no hay raws CAPTURED", async () => {
    findManyMock.mockResolvedValue([]);
    const result = await handleMarketNormalizeBatch(makeJob());
    expect(result.success).toBe(true);
    expect(result.followUpJobs).toBeUndefined();
    expect(createListingMock).not.toHaveBeenCalled();
    expect(updateRawMock).not.toHaveBeenCalled();
  });

  it("crea MarketListing nuevo y encola MARKET_RESOLVE_IDENTITY + MARKET_FETCH_DETAIL", async () => {
    findManyMock.mockResolvedValue([makeFotocasaRaw()]);

    const result = await handleMarketNormalizeBatch(makeJob());

    expect(result.success).toBe(true);
    expect(createListingMock).toHaveBeenCalledTimes(1);
    expect(updateListingMock).not.toHaveBeenCalled();
    expect(updateRawMock).toHaveBeenCalledWith({
      where: { id: "raw-fc-1" },
      data: { status: "NORMALIZED", rejectionReason: null },
    });
    expect(result.followUpJobs).toEqual([
      {
        type: "MARKET_RESOLVE_IDENTITY",
        payload: { listingId: "listing-new-1", source: "source_a" },
        idempotencyKey: "market:identity:listing-new-1",
      },
      {
        // El raw del fixture no trae phones, por eso siempre se encola detail
        // bajo la politica nueva (mayo 2026).
        type: "MARKET_FETCH_DETAIL",
        payload: { listingId: "listing-new-1" },
        idempotencyKey: "market:fetch-detail:listing-new-1",
        maxAttempts: 3,
      },
    ]);

    const created = createListingMock.mock.calls[0]![0]!.data;
    expect(created.source).toBe("source_a");
    expect(created.externalId).toBe("188063260");
    expect(created.price).toBe(175_000);
    expect(created.builtArea).toBe(85);
    expect(created.rooms).toBe(3);
    expect(created.city).toBe("cordoba");
    expect(created.qualityScore).toBeGreaterThan(0);
  });

  it("encola MARKET_FETCH_DETAIL para particular nuevo sin telefono ni imagenes", async () => {
    findManyMock.mockResolvedValue([
      makeFotocasaRaw({
        payload: {
          title: "Piso particular",
          priceRaw: "120.000 €",
          surfaceRaw: "65 m²",
          roomsRaw: "2",
          cityRaw: "cordoba",
          housingRaw: "piso",
          operationRaw: "venta",
          advertiserType: "particular",
          phones: [],
        },
      }),
    ]);

    const result = await handleMarketNormalizeBatch(makeJob());
    expect(result.success).toBe(true);
    expect(result.followUpJobs).toEqual([
      {
        type: "MARKET_RESOLVE_IDENTITY",
        payload: { listingId: "listing-new-1", source: "source_a" },
        idempotencyKey: "market:identity:listing-new-1",
      },
      {
        type: "MARKET_FETCH_DETAIL",
        payload: { listingId: "listing-new-1" },
        idempotencyKey: "market:fetch-detail:listing-new-1",
        maxAttempts: 3,
      },
    ]);
  });

  it("encola MARKET_FETCH_DETAIL TAMBIEN para agencias (politica nueva: click 'Ver telefono' aplica a todos)", async () => {
    findUniqueRunMock.mockResolvedValue({
      id: "run-1",
      seed: { city: "cordoba", zone: null, source: "source_d" },
    });
    findManyMock.mockResolvedValue([
      makeFotocasaRaw({
        source: "source_d",
        payload: {
          title: "Piso agencia",
          priceRaw: "220.000 €",
          surfaceRaw: "90 m²",
          roomsRaw: "3",
          cityRaw: "cordoba",
          housingRaw: "piso",
          operationRaw: "venta",
          advertiserType: "agency",
          phones: [],
        },
      }),
    ]);

    const result = await handleMarketNormalizeBatch(makeJob());
    expect(result.success).toBe(true);
    expect(result.followUpJobs).toEqual([
      {
        type: "MARKET_RESOLVE_IDENTITY",
        payload: { listingId: "listing-new-1", source: "source_d" },
        idempotencyKey: "market:identity:listing-new-1",
      },
      {
        type: "MARKET_FETCH_DETAIL",
        payload: { listingId: "listing-new-1" },
        idempotencyKey: "market:fetch-detail:listing-new-1",
        maxAttempts: 3,
      },
    ]);
  });

  it("actualiza MarketListing existente preservando id", async () => {
    findManyMock.mockResolvedValue([makeFotocasaRaw()]);
    findUniqueListingMock.mockResolvedValue({ id: "listing-existing-1" });

    const result = await handleMarketNormalizeBatch(makeJob());

    expect(result.success).toBe(true);
    expect(updateListingMock).toHaveBeenCalledTimes(1);
    expect(createListingMock).not.toHaveBeenCalled();
    expect(updateListingMock.mock.calls[0]![0]!.where).toEqual({
      id: "listing-existing-1",
    });
    expect(result.followUpJobs?.[0]?.idempotencyKey).toBe(
      "market:identity:listing-existing-1",
    );
  });

  it("REJECTED cuando el raw no tiene canonicalUrl", async () => {
    findManyMock.mockResolvedValue([
      makeFotocasaRaw({ canonicalUrl: "" }),
    ]);

    const result = await handleMarketNormalizeBatch(makeJob());

    expect(result.success).toBe(true);
    expect(updateRawMock).toHaveBeenCalledWith({
      where: { id: "raw-fc-1" },
      data: { status: "REJECTED", rejectionReason: "missing_url" },
    });
    expect(createListingMock).not.toHaveBeenCalled();
    expect(result.followUpJobs ?? []).toEqual([]);
  });

  it("REJECTED cuando el seed del crawlRun no existe", async () => {
    findManyMock.mockResolvedValue([makeFotocasaRaw()]);
    findUniqueRunMock.mockResolvedValue(null);

    const result = await handleMarketNormalizeBatch(makeJob());

    expect(result.success).toBe(true);
    const updateCall = updateRawMock.mock.calls[0]![0];
    expect(updateCall.data.status).toBe("REJECTED");
    expect(updateCall.data.rejectionReason).toContain("sin seed");
    expect(createListingMock).not.toHaveBeenCalled();
  });

  it("encola otro MARKET_NORMALIZE_BATCH cuando llena el batch", async () => {
    const raws = Array.from({ length: 50 }, (_, i) =>
      makeFotocasaRaw({
        id: `raw-${i}`,
        externalId: `id-${i}`,
        contentHash: `hash-${i}`,
      }),
    );
    findManyMock.mockResolvedValue(raws);
    createListingMock.mockImplementation(async (args: { data: { externalId: string } }) => ({
      id: `listing-${args.data.externalId}`,
    }));

    const result = await handleMarketNormalizeBatch(makeJob({ batchSize: 50 }));

    expect(result.success).toBe(true);
    const followUps = result.followUpJobs ?? [];
    const continuation = followUps.find(
      (j) => j.type === "MARKET_NORMALIZE_BATCH",
    );
    expect(continuation).toBeDefined();
    expect(continuation?.idempotencyKey).toMatch(/^market:normalize-batch:/);
    const identityFollowUps = followUps.filter(
      (j) => j.type === "MARKET_RESOLVE_IDENTITY",
    );
    expect(identityFollowUps).toHaveLength(50);
  });

  it("filtra por source cuando se especifica en el payload", async () => {
    findManyMock.mockResolvedValue([]);

    await handleMarketNormalizeBatch(
      makeJob({ source: "source_b", batchSize: 10 }),
    );

    expect(findManyMock).toHaveBeenCalledWith({
      where: { status: "CAPTURED", source: "source_b" },
      orderBy: { capturedAt: "asc" },
      take: 10,
    });
  });

  it("procesa solo el rawListingId cuando se pasa", async () => {
    findManyMock.mockResolvedValue([makeFotocasaRaw()]);

    await handleMarketNormalizeBatch(
      makeJob({ rawListingId: "raw-fc-1" }),
    );

    expect(findManyMock).toHaveBeenCalledWith({
      where: { id: "raw-fc-1" },
      orderBy: { capturedAt: "asc" },
      take: 1,
    });
  });
});
