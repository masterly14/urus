import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  findManyListingMock,
  upsertSnapshotMock,
  createEventMock,
} = vi.hoisted(() => ({
  findManyListingMock: vi.fn(),
  upsertSnapshotMock: vi.fn(),
  createEventMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    marketListing: { findMany: findManyListingMock },
    marketSnapshotIndex: { upsert: upsertSnapshotMock },
    marketEvent: { create: createEventMock },
  },
}));

import { handleMarketRefreshSnapshot } from "../snapshot-handler";
import type { JobRecord } from "@/lib/job-queue/types";

function makeJob(payload: Record<string, unknown>): JobRecord {
  return {
    id: "job-snap-1",
    type: "MARKET_REFRESH_SNAPSHOT",
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

beforeEach(() => {
  vi.clearAllMocks();
  findManyListingMock.mockResolvedValue([]);
  upsertSnapshotMock.mockResolvedValue({});
  createEventMock.mockResolvedValue({});
});

describe("handleMarketRefreshSnapshot", () => {
  it("falla permanentemente sin city", async () => {
    const result = await handleMarketRefreshSnapshot(makeJob({}));
    expect(result.success).toBe(false);
    expect(result.permanent).toBe(true);
  });

  it("upsert por cada combinacion (housingType, operation) y un evento por ciudad", async () => {
    findManyListingMock.mockImplementation(async (args: { where: { housingType: string; operation: string } }) => {
      // Simulate 2 active listings only for flat+sale.
      if (args.where.housingType === "flat" && args.where.operation === "sale") {
        return [
          { price: 175_000, pricePerMeter: 1944, qualityScore: 0.9, status: "active" },
          { price: 200_000, pricePerMeter: 2222, qualityScore: 0.7, status: "active" },
        ];
      }
      return [];
    });

    const result = await handleMarketRefreshSnapshot(
      makeJob({ city: "cordoba", housingTypes: ["flat", "house"], operations: ["sale"] }),
    );

    expect(result.success).toBe(true);
    expect(upsertSnapshotMock).toHaveBeenCalledTimes(2); // flat+sale, house+sale
    const flatSaleCall = upsertSnapshotMock.mock.calls.find(
      (c) =>
        c[0].create.housingType === "flat" && c[0].create.operation === "sale",
    );
    expect(flatSaleCall).toBeDefined();
    expect(flatSaleCall![0]!.create.totalActive).toBe(2);
    expect(flatSaleCall![0]!.create.priceMin).toBe(175_000);
    expect(flatSaleCall![0]!.create.priceMax).toBe(200_000);

    const houseSaleCall = upsertSnapshotMock.mock.calls.find(
      (c) =>
        c[0].create.housingType === "house" && c[0].create.operation === "sale",
    );
    expect(houseSaleCall![0]!.create.totalActive).toBe(0);

    expect(createEventMock).toHaveBeenCalledTimes(1);
    expect(createEventMock.mock.calls[0]![0]!.data.type).toBe(
      "MARKET_SNAPSHOT_REFRESHED",
    );
    expect(createEventMock.mock.calls[0]![0]!.data.payload.city).toBe("cordoba");
    expect(createEventMock.mock.calls[0]![0]!.data.payload.combinationsRefreshed).toBe(
      2,
    );
  });

  it("ignora P2002 al emitir evento (idempotencia diaria)", async () => {
    createEventMock.mockRejectedValueOnce(
      new Error("Unique constraint failed on the fields: (`type`,`fingerprint`)"),
    );
    const result = await handleMarketRefreshSnapshot(
      makeJob({ city: "cordoba", housingTypes: ["flat"], operations: ["sale"] }),
    );
    expect(result.success).toBe(true);
  });

  it("usa MARKET_HOUSING_TYPES y MARKET_OPERATIONS por defecto", async () => {
    await handleMarketRefreshSnapshot(makeJob({ city: "cordoba" }));
    // 15 housing types × 2 operations = 30 combinaciones.
    expect(upsertSnapshotMock).toHaveBeenCalledTimes(30);
  });
});
