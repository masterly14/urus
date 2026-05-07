import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  findUniqueListingMock,
  updateListingMock,
  findUniquePropertyMock,
  findManyListingMock,
  createPropertyMock,
  updatePropertyMock,
  createEventMock,
  transactionMock,
} = vi.hoisted(() => ({
  findUniqueListingMock: vi.fn(),
  updateListingMock: vi.fn(),
  findUniquePropertyMock: vi.fn(),
  findManyListingMock: vi.fn(),
  createPropertyMock: vi.fn(),
  updatePropertyMock: vi.fn(),
  createEventMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    marketListing: {
      findUnique: findUniqueListingMock,
      update: updateListingMock,
      findMany: findManyListingMock,
    },
    marketProperty: {
      findUnique: findUniquePropertyMock,
      create: createPropertyMock,
      update: updatePropertyMock,
    },
    marketEvent: {
      create: createEventMock,
    },
    $transaction: transactionMock,
  },
}));

import { handleMarketResolveIdentity } from "../resolve-identity-handler";
import type { JobRecord } from "@/lib/job-queue/types";

function makeJob(payload: Record<string, unknown> = {}): JobRecord {
  return {
    id: "job-id-1",
    type: "MARKET_RESOLVE_IDENTITY",
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

function makeListing(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "listing-1",
    source: "source_a" as const,
    externalId: "188063260",
    city: "cordoba",
    zone: "centro",
    geohash: "ezsabcd",
    builtArea: 90,
    rooms: 3,
    bathrooms: 2,
    floor: "3",
    housingType: "flat" as const,
    operation: "sale" as const,
    addressApprox: "Calle Mayor 12",
    propertyId: null,
    lastSeenAt: new Date("2026-05-06T10:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  findUniqueListingMock.mockResolvedValue(makeListing());
  findUniquePropertyMock.mockResolvedValue(null);
  findManyListingMock.mockResolvedValue([]);
  updateListingMock.mockResolvedValue({});
  updatePropertyMock.mockResolvedValue({});
  createPropertyMock.mockResolvedValue({ id: "property-new-1" });
  createEventMock.mockResolvedValue({});
  transactionMock.mockResolvedValue([{}, {}]);
});

describe("handleMarketResolveIdentity", () => {
  it("falla permanentemente sin listingId", async () => {
    const result = await handleMarketResolveIdentity(makeJob({}));
    expect(result.success).toBe(false);
    expect(result.permanent).toBe(true);
  });

  it("falla permanentemente cuando el listing no existe", async () => {
    findUniqueListingMock.mockResolvedValue(null);
    const result = await handleMarketResolveIdentity(
      makeJob({ listingId: "ghost" }),
    );
    expect(result.success).toBe(false);
    expect(result.permanent).toBe(true);
  });

  it("auto-merge deterministico cuando fingerprint exacto existe", async () => {
    findUniquePropertyMock.mockResolvedValue({ id: "property-existing" });

    const result = await handleMarketResolveIdentity(
      makeJob({ listingId: "listing-1" }),
    );

    expect(result.success).toBe(true);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(createPropertyMock).not.toHaveBeenCalled();
    expect(createEventMock).toHaveBeenCalledTimes(1);
    expect(createEventMock.mock.calls[0]![0]!.data.type).toBe(
      "MARKET_PROPERTY_MERGED",
    );
    expect(result.followUpJobs?.[1]?.type).toBe("MARKET_DIFF_AND_VERSION");
    expect(result.followUpJobs?.[1]?.idempotencyKey).toMatch(
      /^market:diff:listing-1:/,
    );
  });

  it("crea property nueva cuando no hay candidatos similares", async () => {
    findUniquePropertyMock.mockResolvedValue(null);
    findManyListingMock.mockResolvedValue([]);

    const result = await handleMarketResolveIdentity(
      makeJob({ listingId: "listing-1" }),
    );

    expect(result.success).toBe(true);
    expect(createPropertyMock).toHaveBeenCalledTimes(1);
    const createArgs = createPropertyMock.mock.calls[0]![0]!.data;
    expect(createArgs.city).toBe("cordoba");
    expect(createArgs.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(createArgs.representativeListingId).toBe("listing-1");
    expect(createArgs.listingsCount).toBe(1);
    // El evento MERGED se emite solo en exact/auto-merge, no en "new".
    expect(createEventMock).not.toHaveBeenCalled();
  });

  it("auto-merge cuando hay candidato con score >= 0.90", async () => {
    findUniquePropertyMock.mockResolvedValue(null);
    // Candidato gemelo con propertyId ya asignado: mismo geohash, area, rooms, etc.
    findManyListingMock.mockResolvedValue([
      makeListing({
        id: "listing-twin",
        source: "source_b",
        externalId: "twin-99",
        propertyId: "property-existing-99",
      }),
    ]);

    const result = await handleMarketResolveIdentity(
      makeJob({ listingId: "listing-1" }),
    );

    expect(result.success).toBe(true);
    // Deberia fundirse a la property del candidato
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(createPropertyMock).not.toHaveBeenCalled();
    expect(createEventMock.mock.calls[0]![0]!.data.type).toBe(
      "MARKET_PROPERTY_MERGED",
    );
    expect(createEventMock.mock.calls[0]![0]!.data.payload.score).toBeGreaterThanOrEqual(
      0.9,
    );
  });

  it("manual-review cuando 0.70 <= score < 0.90", async () => {
    findUniquePropertyMock.mockResolvedValue(null);
    // Candidato con mismo geohash + area + rooms + housingType pero
    // distinto floor + sin bathrooms + sin address → score ≈ 0.75.
    findManyListingMock.mockResolvedValue([
      makeListing({
        id: "listing-similar",
        source: "source_b",
        externalId: "sim-1",
        floor: "5",
        addressApprox: null,
        bathrooms: null,
        propertyId: null,
      }),
    ]);

    const result = await handleMarketResolveIdentity(
      makeJob({ listingId: "listing-1" }),
    );

    expect(result.success).toBe(true);
    expect(createPropertyMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
    const reviewEventCalls = createEventMock.mock.calls.filter(
      (call) => call[0].data.type === "MARKET_PROPERTY_REVIEW_REQUIRED",
    );
    expect(reviewEventCalls.length).toBe(1);
    expect(reviewEventCalls[0]![0]!.data.payload.candidateListingIds).toContain(
      "listing-similar",
    );
  });

  it("encola siempre MARKET_DIFF_AND_VERSION como follow-up", async () => {
    findUniquePropertyMock.mockResolvedValue(null);
    findManyListingMock.mockResolvedValue([]);

    const result = await handleMarketResolveIdentity(
      makeJob({ listingId: "listing-1" }),
    );

    expect(result.followUpJobs).toHaveLength(2);
    expect(result.followUpJobs?.[0]?.type).toBe("MARKET_RESOLVE_ADVERTISER");
    expect(result.followUpJobs?.[0]?.payload).toEqual({ listingId: "listing-1" });
    expect(result.followUpJobs?.[0]?.idempotencyKey).toBe(
      "market:advertiser:listing-1",
    );
    expect(result.followUpJobs?.[1]?.type).toBe("MARKET_DIFF_AND_VERSION");
    expect(result.followUpJobs?.[1]?.payload).toEqual({ listingId: "listing-1" });
  });

  it("ignora P2002 al emitir evento (idempotencia)", async () => {
    findUniquePropertyMock.mockResolvedValue({ id: "property-existing" });
    createEventMock.mockRejectedValueOnce(
      new Error("Unique constraint failed on the fields: (`type`,`fingerprint`)"),
    );

    const result = await handleMarketResolveIdentity(
      makeJob({ listingId: "listing-1" }),
    );

    expect(result.success).toBe(true);
  });
});
