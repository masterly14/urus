import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  canExecuteMock,
  recordSuccessMock,
  recordFailureMock,
  findUniqueMock,
  upsertMock,
  updateMock,
  downloadPortalImageMock,
  uploaderUploadMock,
} = vi.hoisted(() => ({
  canExecuteMock: vi.fn(),
  recordSuccessMock: vi.fn(),
  recordFailureMock: vi.fn(),
  findUniqueMock: vi.fn(),
  upsertMock: vi.fn(),
  updateMock: vi.fn(),
  downloadPortalImageMock: vi.fn(),
  uploaderUploadMock: vi.fn(),
}));

vi.mock("@/lib/circuit-breaker", () => ({
  canExecute: canExecuteMock,
  recordSuccess: recordSuccessMock,
  recordFailure: recordFailureMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    marketListing: {
      findUnique: findUniqueMock,
    },
    marketListingImage: {
      upsert: upsertMock,
      update: updateMock,
    },
  },
}));

vi.mock("@/lib/statefox/image-cache/upload", () => ({
  downloadPortalImage: downloadPortalImageMock,
}));

vi.mock("@/lib/cloudinary", () => ({
  getCloudinary: () => ({
    uploader: {
      upload: uploaderUploadMock,
    },
  }),
}));

import type { JobRecord } from "@/lib/job-queue/types";
import { handleMarketImportListingImages } from "../import-listing-images-handler";

function makeJob(payload: Record<string, unknown>): JobRecord {
  return {
    id: "job-market-image-1",
    type: "MARKET_IMPORT_LISTING_IMAGES",
    status: "IN_PROGRESS",
    payload: payload as JobRecord["payload"],
    priority: 85,
    attempts: 1,
    maxAttempts: 4,
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
  canExecuteMock.mockResolvedValue({
    allowed: true,
    state: { failureCount: 0, openedAt: null },
  } as never);
  recordSuccessMock.mockResolvedValue(undefined);
  recordFailureMock.mockResolvedValue(undefined);
  findUniqueMock.mockResolvedValue({
    id: "listing-1",
    source: "source_d",
    canonicalUrl: "https://www.idealista.com/inmueble/123/",
    imageUrls: ["https://img4.idealista.com/a.jpg"],
  });
  upsertMock.mockResolvedValue({});
  updateMock.mockResolvedValue({});
  downloadPortalImageMock.mockResolvedValue({
    url: "https://img4.idealista.com/a.jpg",
    buffer: Buffer.from("img"),
    contentType: "image/jpeg",
    bytes: 3,
    sha256: "abc",
    format: "jpg",
  });
  uploaderUploadMock.mockResolvedValue({
    public_id: "market/idealista/listing-1/0",
    secure_url: "https://res.cloudinary.com/demo/a.jpg",
    bytes: 123,
    format: "jpg",
    width: 600,
    height: 400,
  });
});

describe("handleMarketImportListingImages", () => {
  it("falla permanentemente sin listingId", async () => {
    const result = await handleMarketImportListingImages(makeJob({}));
    expect(result.success).toBe(false);
    expect(result.permanent).toBe(true);
  });

  it("importa imágenes y completa con éxito", async () => {
    const result = await handleMarketImportListingImages(
      makeJob({ listingId: "listing-1" }),
    );

    expect(result.success).toBe(true);
    expect(downloadPortalImageMock).toHaveBeenCalledTimes(1);
    expect(uploaderUploadMock).toHaveBeenCalledTimes(1);
    expect(recordSuccessMock).toHaveBeenCalledWith("market-image-import:idealista");
    expect(recordFailureMock).not.toHaveBeenCalled();
  });

  it("devuelve error retriable cuando falla descarga/subida", async () => {
    downloadPortalImageMock.mockRejectedValueOnce(new Error("timeout fetch"));

    const result = await handleMarketImportListingImages(
      makeJob({ listingId: "listing-1" }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("timeout");
    expect(recordFailureMock).toHaveBeenCalledWith(
      "market-image-import:idealista",
      expect.stringContaining("timeout"),
    );
  });
});
