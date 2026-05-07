import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobRecord } from "@/lib/job-queue/types";

const { findUniqueMock, updateMock, runCrawlDetailMock } = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
  updateMock: vi.fn(),
  runCrawlDetailMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    marketListing: {
      findUnique: findUniqueMock,
      update: updateMock,
    },
  },
}));

vi.mock("@/lib/workers/contracts/market-worker-client", () => {
  class MockClient {
    async runCrawlDetail(...args: unknown[]) {
      return runCrawlDetailMock(...args);
    }
  }
  class MockError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    MarketWorkerClient: MockClient,
    MarketWorkerError: MockError,
  };
});

import { handleMarketFetchDetail } from "../fetch-detail-handler";

interface ListingMockOverrides {
  id?: string;
  source?: string;
  externalId?: string;
  canonicalUrl?: string;
  advertiserType?: string | null;
  advertiserName?: string | null;
  phones?: string[];
  description?: string | null;
  imageUrls?: string[];
  listingReference?: string | null;
  cadastralRef?: string | null;
  detailFetchAttempts?: number;
}

function makeListing(over: ListingMockOverrides = {}) {
  return {
    id: "listing-1",
    source: "source_d",
    externalId: "123456789",
    canonicalUrl: "https://www.idealista.com/inmueble/123456789/",
    advertiserType: "agency",
    advertiserName: null,
    phones: [],
    description: null,
    imageUrls: [],
    listingReference: null,
    cadastralRef: null,
    detailFetchAttempts: 0,
    ...over,
  };
}

interface DetailResponseOverrides {
  status?: "completed" | "blocked" | "failed";
  phones?: string[];
  advertiserName?: string | null;
  advertiserType?: "particular" | "agency" | null;
  description?: string | null;
  imageUrls?: string[];
  listingReference?: string | null;
  cadastralRef?: string | null;
  clickedRevealPhone?: boolean;
}

function makeDetailResponse(over: DetailResponseOverrides = {}) {
  return {
    status: "completed",
    source: "source_d",
    canonicalUrl: "https://www.idealista.com/inmueble/123456789/",
    phones: ["600111222"],
    advertiserName: "Particular",
    advertiserType: "particular",
    description: "Descripcion completa.",
    imageUrls: ["https://img.example/a.jpg"],
    listingReference: "REF-1",
    cadastralRef: null,
    clickedRevealPhone: true,
    httpStatus: 200,
    strategy: "idealista-residential",
    traceId: "trace",
    ...over,
  };
}

function makeJob(payload: Record<string, unknown>): JobRecord {
  return {
    id: "job-market-detail-1",
    type: "MARKET_FETCH_DETAIL",
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
  process.env.MARKET_WORKER_BASE_URL = "https://worker.example.com";
  process.env.MARKET_WORKER_SHARED_SECRET = "shared";
});

describe("handleMarketFetchDetail (politica nueva: agencias incluidas + ficha completa)", () => {
  it("falla permanente sin listingId", async () => {
    const result = await handleMarketFetchDetail(makeJob({}));
    expect(result.success).toBe(false);
    expect(result.permanent).toBe(true);
  });

  it("omite cuando la ficha ya esta completa (phones+description+images)", async () => {
    findUniqueMock.mockResolvedValue(
      makeListing({
        phones: ["+34600111222"],
        description: "Descripcion completa de la casa.",
        imageUrls: ["https://img.example/a.jpg"],
      }),
    );

    const result = await handleMarketFetchDetail(makeJob({ listingId: "listing-1" }));
    expect(result.success).toBe(true);
    expect(runCrawlDetailMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("procesa AGENCIAS (politica nueva): hace click + extrae todos los campos", async () => {
    findUniqueMock.mockResolvedValue(
      makeListing({ source: "source_d", advertiserType: "agency" }),
    );
    runCrawlDetailMock.mockResolvedValue(
      makeDetailResponse({
        phones: ["857680852"],
        advertiserType: "agency",
        advertiserName: "Condado Homes",
        description: "Casa o chalet independiente. 8 habitaciones.",
        imageUrls: [
          "https://img.example/photo1.jpg",
          "https://img.example/photo2.jpg",
        ],
        listingReference: "VES250414SM",
        cadastralRef: null,
        clickedRevealPhone: true,
      }),
    );
    updateMock.mockResolvedValue({});

    const result = await handleMarketFetchDetail(makeJob({ listingId: "listing-1" }));
    expect(result.success).toBe(true);
    expect(runCrawlDetailMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledTimes(1);

    const updateArgs = updateMock.mock.calls[0]![0]!;
    expect(updateArgs.data.phones).toEqual(["+34857680852"]);
    expect(updateArgs.data.description).toBe(
      "Casa o chalet independiente. 8 habitaciones.",
    );
    expect(updateArgs.data.imageUrls).toEqual([
      "https://img.example/photo1.jpg",
      "https://img.example/photo2.jpg",
    ]);
    expect(updateArgs.data.mainImageUrl).toBe("https://img.example/photo1.jpg");
    expect(updateArgs.data.listingReference).toBe("VES250414SM");
    expect(updateArgs.data.advertiserName).toBe("Condado Homes");
    expect(updateArgs.data.detailFetchAttempts).toEqual({ increment: 1 });
    expect(updateArgs.data.detailFetchedAt).toBeInstanceOf(Date);
  });

  it("encola MARKET_RESOLVE_ADVERTISER cuando hay nuevos phones/advertiser", async () => {
    findUniqueMock.mockResolvedValue(makeListing());
    runCrawlDetailMock.mockResolvedValue(
      makeDetailResponse({ phones: ["+34600111222"] }),
    );
    updateMock.mockResolvedValue({});

    const result = await handleMarketFetchDetail(makeJob({ listingId: "listing-1" }));
    expect(result.success).toBe(true);
    expect(result.followUpJobs).toHaveLength(1);
    expect(result.followUpJobs?.[0]?.type).toBe("MARKET_RESOLVE_ADVERTISER");
  });

  it("skip cuando ya se intento detail MAX_DETAIL_FETCH_ATTEMPTS veces y marca phone_unavailable", async () => {
    findUniqueMock.mockResolvedValue(makeListing({ detailFetchAttempts: 3, phones: [] }));
    updateMock.mockResolvedValue({});

    const result = await handleMarketFetchDetail(makeJob({ listingId: "listing-1" }));
    expect(result.success).toBe(true);
    expect(runCrawlDetailMock).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0]![0]!.data.captacionLastError).toBe(
      "phone_unavailable",
    );
  });

  it("actualiza intento incluso cuando worker devuelve blocked", async () => {
    findUniqueMock.mockResolvedValue(makeListing());
    runCrawlDetailMock.mockResolvedValue({
      status: "blocked",
      reason: "datadome",
      traceId: "trace",
    });
    updateMock.mockResolvedValue({});

    const result = await handleMarketFetchDetail(makeJob({ listingId: "listing-1" }));
    expect(result.success).toBe(false);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0]![0]!.data.detailFetchAttempts).toEqual({
      increment: 1,
    });
  });

  it("dedupea imageUrls cuando hay overlap entre listing y detail", async () => {
    findUniqueMock.mockResolvedValue(
      makeListing({
        imageUrls: ["https://img.example/a.jpg"],
      }),
    );
    runCrawlDetailMock.mockResolvedValue(
      makeDetailResponse({
        imageUrls: ["https://img.example/a.jpg", "https://img.example/b.jpg"],
      }),
    );
    updateMock.mockResolvedValue({});

    await handleMarketFetchDetail(makeJob({ listingId: "listing-1" }));
    const updateArgs = updateMock.mock.calls[0]![0]!;
    expect(updateArgs.data.imageUrls).toEqual([
      "https://img.example/a.jpg",
      "https://img.example/b.jpg",
    ]);
  });

  it("preserva description existente cuando la nueva es mas corta", async () => {
    findUniqueMock.mockResolvedValue(
      makeListing({
        description:
          "Descripcion previamente capturada que es muy larga y completa.".repeat(2),
      }),
    );
    runCrawlDetailMock.mockResolvedValue(
      makeDetailResponse({ description: "Corta." }),
    );
    updateMock.mockResolvedValue({});

    await handleMarketFetchDetail(makeJob({ listingId: "listing-1" }));
    const updateArgs = updateMock.mock.calls[0]![0]!;
    expect(updateArgs.data.description).toBeUndefined();
  });
});
