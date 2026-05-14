import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  findUniqueListingMock,
  updateListingMock,
  findFirstVersionMock,
  createVersionMock,
  findUniqueEventMock,
  createEventMock,
  transactionMock,
} = vi.hoisted(() => ({
  findUniqueListingMock: vi.fn(),
  updateListingMock: vi.fn(),
  findFirstVersionMock: vi.fn(),
  createVersionMock: vi.fn(),
  findUniqueEventMock: vi.fn(),
  createEventMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    marketListing: {
      findUnique: findUniqueListingMock,
      update: updateListingMock,
    },
    marketListingVersion: {
      findFirst: findFirstVersionMock,
      create: createVersionMock,
    },
    marketEvent: {
      findUnique: findUniqueEventMock,
      create: createEventMock,
    },
    $transaction: transactionMock,
  },
}));

import { handleMarketDiffAndVersion } from "../diff-handler";
import type { JobRecord } from "@/lib/job-queue/types";

function makeJob(payload: Record<string, unknown> = {}): JobRecord {
  return {
    id: "job-diff-1",
    type: "MARKET_DIFF_AND_VERSION",
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

function makeListingRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "listing-diff-1",
    source: "source_a",
    externalId: "ext-1",
    canonicalUrl: "https://www.fotocasa.es/x/1/d",
    operation: "sale",
    housingType: "flat",
    status: "active",
    price: 175_000,
    currency: "EUR",
    pricePerMeter: 1944,
    builtArea: 90,
    rooms: 3,
    bathrooms: 2,
    floor: "3",
    city: "cordoba",
    zone: "centro",
    addressApprox: "Calle Mayor 12",
    lat: 37.88,
    lng: -4.78,
    geohash: "ezsabcd",
    advertiserType: "professional",
    advertiserName: "Inmo X",
    phones: ["957123456"],
    mainImageUrl: "https://img.example.com/1.jpg",
    imageUrls: ["https://img.example.com/1.jpg"],
    qualityScore: 0.9,
    qualityFlags: [],
    propertyId: null,
    firstSeenAt: new Date("2026-05-06T10:00:00Z"),
    lastSeenAt: new Date("2026-05-06T10:00:00Z"),
    lastChangeAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  findUniqueListingMock.mockResolvedValue(makeListingRow());
  findFirstVersionMock.mockResolvedValue(null);
  findUniqueEventMock.mockResolvedValue(null);
  createVersionMock.mockResolvedValue({});
  createEventMock.mockResolvedValue({});
  updateListingMock.mockResolvedValue({});
  transactionMock.mockResolvedValue([{}, {}, {}]);
});

describe("handleMarketDiffAndVersion", () => {
  it("falla permanentemente sin listingId", async () => {
    const result = await handleMarketDiffAndVersion(makeJob({}));
    expect(result.success).toBe(false);
    expect(result.permanent).toBe(true);
  });

  it("falla permanentemente cuando el listing no existe", async () => {
    findUniqueListingMock.mockResolvedValue(null);
    const result = await handleMarketDiffAndVersion(
      makeJob({ listingId: "ghost" }),
    );
    expect(result.success).toBe(false);
    expect(result.permanent).toBe(true);
  });

  it("emite MARKET_LISTING_CREATED en primer diff (sin version previa)", async () => {
    const result = await handleMarketDiffAndVersion(
      makeJob({ listingId: "listing-diff-1" }),
    );

    expect(result.success).toBe(true);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    const txCalls = transactionMock.mock.calls[0]![0]!;
    expect(Array.isArray(txCalls)).toBe(true);
    expect(createVersionMock).toHaveBeenCalledTimes(1);
    expect(createEventMock).toHaveBeenCalledTimes(1);
    expect(createEventMock.mock.calls[0]![0]!.data.type).toBe(
      "MARKET_LISTING_CREATED",
    );
  });

  it("emite MARKET_LISTING_PRICE_CHANGED cuando solo cambia el precio", async () => {
    findFirstVersionMock.mockResolvedValue({
      id: "v-prev",
      capturedAt: new Date("2026-05-05T10:00:00Z"),
      after: {
        source: "source_a",
        externalId: "ext-1",
        status: "active",
        price: 180_000,
        builtArea: 90,
        rooms: 3,
        bathrooms: 2,
        floor: "3",
        city: "cordoba",
        zone: "centro",
        addressApprox: "Calle Mayor 12",
        lat: 37.88,
        lng: -4.78,
        geohash: "ezsabcd",
        advertiserType: "professional",
        advertiserName: "Inmo X",
        phones: ["957123456"],
        mainImageUrl: "https://img.example.com/1.jpg",
        imageUrls: ["https://img.example.com/1.jpg"],
        pricePerMeter: 1944,
        qualityScore: 0.9,
      },
    });

    const result = await handleMarketDiffAndVersion(
      makeJob({ listingId: "listing-diff-1" }),
    );

    expect(result.success).toBe(true);
    expect(createEventMock).toHaveBeenCalledTimes(1);
    expect(createEventMock.mock.calls[0]![0]!.data.type).toBe(
      "MARKET_LISTING_PRICE_CHANGED",
    );
    const eventPayload = createEventMock.mock.calls[0]![0]!.data.payload;
    expect(eventPayload.priceDelta.abs).toBe(-5_000);
  });

  it("no-op cuando estado actual es identico al de la ultima version", async () => {
    const sameAfter = {
      source: "source_a",
      externalId: "ext-1",
      status: "active",
      price: 175_000,
      pricePerMeter: 1944,
      builtArea: 90,
      rooms: 3,
      bathrooms: 2,
      floor: "3",
      city: "cordoba",
      zone: "centro",
      addressApprox: "Calle Mayor 12",
      lat: 37.88,
      lng: -4.78,
      geohash: "ezsabcd",
      advertiserType: "professional",
      advertiserName: "Inmo X",
      phones: ["957123456"],
      mainImageUrl: "https://img.example.com/1.jpg",
      imageUrls: ["https://img.example.com/1.jpg"],
      qualityScore: 0.9,
    };
    findFirstVersionMock.mockResolvedValue({
      id: "v-prev",
      capturedAt: new Date("2026-05-05T10:00:00Z"),
      after: sameAfter,
    });

    const result = await handleMarketDiffAndVersion(
      makeJob({ listingId: "listing-diff-1" }),
    );

    expect(result.success).toBe(true);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(createVersionMock).not.toHaveBeenCalled();
    expect(createEventMock).not.toHaveBeenCalled();
  });

  it("idempotencia: si el evento ya existe, no inserta version ni event", async () => {
    findUniqueEventMock.mockResolvedValue({ id: "existing-event" });

    const result = await handleMarketDiffAndVersion(
      makeJob({ listingId: "listing-diff-1" }),
    );

    expect(result.success).toBe(true);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(createVersionMock).not.toHaveBeenCalled();
    expect(createEventMock).not.toHaveBeenCalled();
  });
});
