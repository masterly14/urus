import { beforeEach, describe, expect, it, vi } from "vitest";

const { findManyMock, upsertMock, enqueueJobMock } = vi.hoisted(() => ({
  findManyMock: vi.fn(),
  upsertMock: vi.fn(),
  enqueueJobMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    marketListingImage: {
      findMany: findManyMock,
      upsert: upsertMock,
    },
  },
}));

vi.mock("@/lib/job-queue", () => ({
  enqueueJob: enqueueJobMock,
}));

import { queueMarketImageImportsForListings } from "@/lib/market/image-import";

beforeEach(() => {
  vi.clearAllMocks();
  findManyMock.mockResolvedValue([]);
  upsertMock.mockResolvedValue({});
  enqueueJobMock.mockResolvedValue({});
  process.env.MARKET_IMAGE_IMPORT_PORTALS = "idealista";
});

describe("queueMarketImageImportsForListings", () => {
  it("encola MARKET_IMPORT_LISTING_IMAGES para idealista", async () => {
    await queueMarketImageImportsForListings([
      {
        id: "listing-1",
        source: "source_d",
        imageUrls: ["https://img4.idealista.com/a.jpg"],
      },
    ]);

    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(enqueueJobMock).toHaveBeenCalledTimes(1);
    expect(enqueueJobMock.mock.calls[0]![0]).toMatchObject({
      type: "MARKET_IMPORT_LISTING_IMAGES",
      payload: { listingId: "listing-1" },
      priority: 85,
      maxAttempts: 4,
    });
  });

  it("no encola si ya existe cache IMPORTED para la misma URL", async () => {
    findManyMock.mockResolvedValue([
      {
        imageIndex: 0,
        originalImageUrl: "https://img4.idealista.com/a.jpg",
        status: "IMPORTED",
        cloudinarySecureUrl: "https://res.cloudinary.com/demo/a.jpg",
      },
    ]);

    await queueMarketImageImportsForListings([
      {
        id: "listing-1",
        source: "source_d",
        imageUrls: ["https://img4.idealista.com/a.jpg"],
      },
    ]);

    expect(upsertMock).not.toHaveBeenCalled();
    expect(enqueueJobMock).not.toHaveBeenCalled();
  });
});
