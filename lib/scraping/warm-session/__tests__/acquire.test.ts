import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  executeRaw: vi.fn(),
  transaction: vi.fn(),
  warmPortalSession: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    portalWarmSession: {
      fields: { maxRequests: "maxRequests" },
      updateMany: mocks.updateMany,
      findFirst: mocks.findFirst,
      create: mocks.create,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("../warm", () => ({
  warmPortalSession: mocks.warmPortalSession,
}));

import { acquireWarmSession } from "../acquire";

const baseRequest = {
  source: "idealista" as const,
  policy: {
    enabled: true,
    requireCdp: true,
    ttlMs: 1_000,
    maxRequests: 40,
  },
  headless: true,
  brightDataUrl: "wss://brd.example",
  brightDataConnectTimeoutMs: 5_000,
  captchaSolveEnabled: true,
  captchaDetectTimeoutMs: 1_000,
};

function row(overrides = {}) {
  return {
    id: "warm_1",
    source: "idealista",
    cookieHeader: "datadome=abc",
    userAgent: "UA",
    proxySession: null,
    status: "ACTIVE",
    requestCount: 0,
    maxRequests: 40,
    expiresAt: new Date(Date.now() + 60_000),
    lastUsedAt: null,
    warmedAt: new Date(),
    invalidatedAt: null,
    invalidReason: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateMany.mockResolvedValue({ count: 0 });
  mocks.transaction.mockImplementation(async (callback) =>
    callback({
      $executeRaw: mocks.executeRaw,
      portalWarmSession: {
        fields: { maxRequests: "maxRequests" },
        updateMany: mocks.updateMany,
        findFirst: mocks.findFirst,
        create: mocks.create,
      },
    }),
  );
});

describe("acquireWarmSession", () => {
  it("devuelve sesión activa sin calentar de nuevo", async () => {
    mocks.findFirst.mockResolvedValueOnce(row());

    const result = await acquireWarmSession(baseRequest);

    expect(result.status).toBe("ready");
    expect(result.status === "ready" ? result.warmed : null).toBe(false);
    expect(mocks.warmPortalSession).not.toHaveBeenCalled();
  });

  it("devuelve unavailable si no hay CDP ni sesión activa", async () => {
    mocks.findFirst.mockResolvedValueOnce(null);

    const result = await acquireWarmSession({
      ...baseRequest,
      brightDataUrl: undefined,
    });

    expect(result).toEqual({
      status: "unavailable",
      reason: "No hay warm session activa y BRIGHTDATA_SCRAPING_BROWSER_URL no está configurada",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("calienta y persiste sesión cuando no hay una válida", async () => {
    mocks.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    mocks.warmPortalSession.mockResolvedValue({
      cookieHeader: "datadome=abc",
      userAgent: "UA warmed",
      proxySession: "urus-dev",
    });
    mocks.create.mockResolvedValue(row({ userAgent: "UA warmed", proxySession: "urus-dev" }));

    const result = await acquireWarmSession(baseRequest);

    expect(result.status).toBe("ready");
    expect(result.status === "ready" ? result.warmed : null).toBe(true);
    expect(mocks.executeRaw).toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cookieHeader: "datadome=abc",
          userAgent: "UA warmed",
          proxySession: "urus-dev",
          maxRequests: 40,
        }),
      }),
    );
  });
});
