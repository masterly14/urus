import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobRecord } from "@/lib/job-queue/types";
import { handleMarketResolveAdvertiser } from "../resolve-advertiser-handler";

const {
  findUniqueListingMock,
  updateListingMock,
  findUniqueAdvertiserMock,
  findFirstAdvertiserMock,
  createAdvertiserMock,
  updateAdvertiserMock,
} = vi.hoisted(() => ({
  findUniqueListingMock: vi.fn(),
  updateListingMock: vi.fn(),
  findUniqueAdvertiserMock: vi.fn(),
  findFirstAdvertiserMock: vi.fn(),
  createAdvertiserMock: vi.fn(),
  updateAdvertiserMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    marketListing: {
      findUnique: findUniqueListingMock,
      update: updateListingMock,
    },
    marketAdvertiser: {
      findUnique: findUniqueAdvertiserMock,
      findFirst: findFirstAdvertiserMock,
      create: createAdvertiserMock,
      update: updateAdvertiserMock,
    },
  },
}));

function makeJob(payload: Record<string, unknown> = {}): JobRecord {
  return {
    id: "job-advertiser-1",
    type: "MARKET_RESOLVE_ADVERTISER",
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
    city: "cordoba",
    advertiserType: "particular",
    advertiserName: "Juan",
    phones: ["601234567"],
    advertiserId: null,
    lastSeenAt: new Date("2026-05-06T12:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  findUniqueListingMock.mockResolvedValue(makeListing());
  findUniqueAdvertiserMock.mockResolvedValue(null);
  findFirstAdvertiserMock.mockResolvedValue(null);
  createAdvertiserMock.mockResolvedValue({
    id: "adv-1",
    displayName: "Juan",
    advertiserType: "particular",
    lastSeenAt: new Date("2026-05-06T12:00:00Z"),
  });
  updateListingMock.mockResolvedValue({});
  updateAdvertiserMock.mockResolvedValue({});
});

describe("handleMarketResolveAdvertiser", () => {
  it("crea advertiser por telefono y vincula listing", async () => {
    const result = await handleMarketResolveAdvertiser(
      makeJob({ listingId: "listing-1" }),
    );

    expect(result.success).toBe(true);
    expect(createAdvertiserMock).toHaveBeenCalledTimes(1);
    expect(createAdvertiserMock.mock.calls[0]?.[0]?.data.phoneCanonical).toBe(
      "+34601234567",
    );
    expect(updateListingMock).toHaveBeenCalledWith({
      where: { id: "listing-1" },
      data: { advertiserId: "adv-1" },
    });
  });

  it("reutiliza advertiser existente por telefono sin duplicar", async () => {
    findFirstAdvertiserMock.mockResolvedValue({
      id: "adv-existing",
      displayName: "Particular",
      advertiserType: "particular",
      lastSeenAt: new Date("2026-05-01T12:00:00Z"),
    });

    const result = await handleMarketResolveAdvertiser(
      makeJob({ listingId: "listing-1" }),
    );

    expect(result.success).toBe(true);
    expect(createAdvertiserMock).not.toHaveBeenCalled();
    expect(updateListingMock).toHaveBeenCalledWith({
      where: { id: "listing-1" },
      data: { advertiserId: "adv-existing" },
    });
  });

  it("dos formatos del mismo telefono convergen al mismo advertiser", async () => {
    findUniqueListingMock
      .mockResolvedValueOnce(
        makeListing({ id: "listing-a", phones: ["601234567"] }),
      )
      .mockResolvedValueOnce(
        makeListing({ id: "listing-b", phones: ["+34 601 23 45 67"] }),
      );

    findFirstAdvertiserMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "adv-phone",
        displayName: "Juan",
        advertiserType: "particular",
        lastSeenAt: new Date("2026-05-06T12:00:00Z"),
      });

    createAdvertiserMock.mockResolvedValueOnce({
      id: "adv-phone",
      displayName: "Juan",
      advertiserType: "particular",
      lastSeenAt: new Date("2026-05-06T12:00:00Z"),
    });

    await handleMarketResolveAdvertiser(makeJob({ listingId: "listing-a" }));
    await handleMarketResolveAdvertiser(makeJob({ listingId: "listing-b" }));

    expect(createAdvertiserMock).toHaveBeenCalledTimes(1);
    expect(findFirstAdvertiserMock).toHaveBeenNthCalledWith(1, {
      where: { phoneCanonical: "+34601234567" },
      select: {
        id: true,
        displayName: true,
        advertiserType: true,
        lastSeenAt: true,
      },
    });
    expect(findFirstAdvertiserMock).toHaveBeenNthCalledWith(2, {
      where: { phoneCanonical: "+34601234567" },
      select: {
        id: true,
        displayName: true,
        advertiserType: true,
        lastSeenAt: true,
      },
    });
  });

  it("clusteriza agencia sin telefono por nombre+ciudad", async () => {
    findUniqueListingMock.mockResolvedValue(
      makeListing({
        advertiserType: "agency",
        advertiserName: "INMOLIKE",
        phones: [],
      }),
    );
    createAdvertiserMock.mockResolvedValue({
      id: "adv-agency",
      displayName: "INMOLIKE",
      advertiserType: "agency",
      lastSeenAt: new Date("2026-05-06T12:00:00Z"),
    });

    const result = await handleMarketResolveAdvertiser(
      makeJob({ listingId: "listing-1" }),
    );

    expect(result.success).toBe(true);
    expect(findFirstAdvertiserMock).toHaveBeenCalledWith({
      where: {
        phoneCanonical: null,
        advertiserType: "agency",
        displayName: { equals: "INMOLIKE", mode: "insensitive" },
        listings: {
          some: { city: "cordoba" },
        },
      },
      select: { id: true, lastSeenAt: true },
    });
    expect(updateListingMock).toHaveBeenCalledWith({
      where: { id: "listing-1" },
      data: { advertiserId: "adv-agency" },
    });
  });

  it("particular sin telefono hace no-op", async () => {
    findUniqueListingMock.mockResolvedValue(
      makeListing({
        advertiserType: "particular",
        phones: [],
      }),
    );

    const result = await handleMarketResolveAdvertiser(
      makeJob({ listingId: "listing-1" }),
    );

    expect(result.success).toBe(true);
    expect(createAdvertiserMock).not.toHaveBeenCalled();
    expect(updateListingMock).not.toHaveBeenCalled();
  });

  it("telefono invalido cae al camino de agencia si aplica", async () => {
    findUniqueListingMock.mockResolvedValue(
      makeListing({
        advertiserType: "agency",
        advertiserName: "INMOLIKE",
        phones: ["123"],
      }),
    );
    createAdvertiserMock.mockResolvedValue({
      id: "adv-agency",
      displayName: "INMOLIKE",
      advertiserType: "agency",
      lastSeenAt: new Date("2026-05-06T12:00:00Z"),
    });

    const result = await handleMarketResolveAdvertiser(
      makeJob({ listingId: "listing-1" }),
    );

    expect(result.success).toBe(true);
    expect(findUniqueAdvertiserMock).not.toHaveBeenCalled();
    expect(createAdvertiserMock).toHaveBeenCalledTimes(1);
  });
});
