/**
 * Tests del factory `createWarmSessionAcquire(prisma)` que demuestran que
 * el modulo warm-session puede operar con un PrismaClient distinto al
 * singleton de `@/lib/prisma`. Esto habilita al Market Worker (Railway) a
 * usarlo desde su propio proceso sin importar el monolito Next.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  // Prisma "global" (monolito, @/lib/prisma)
  globalUpdateMany: vi.fn(),
  globalFindFirst: vi.fn(),
  globalCreate: vi.fn(),
  globalExecuteRaw: vi.fn(),
  globalTransaction: vi.fn(),
  // Prisma "worker" (instancia separada inyectada)
  workerUpdateMany: vi.fn(),
  workerFindFirst: vi.fn(),
  workerCreate: vi.fn(),
  workerExecuteRaw: vi.fn(),
  workerTransaction: vi.fn(),
  warmPortalSession: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    portalWarmSession: {
      fields: { maxRequests: "maxRequests" },
      updateMany: mocks.globalUpdateMany,
      findFirst: mocks.globalFindFirst,
      create: mocks.globalCreate,
    },
    $transaction: mocks.globalTransaction,
    $executeRaw: mocks.globalExecuteRaw,
  },
}));

vi.mock("../warm", () => ({
  warmPortalSession: mocks.warmPortalSession,
}));

import { createWarmSessionAcquire } from "../acquire";
import type { WarmSessionPrismaClient } from "../repo";

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
    id: "warm_worker_1",
    source: "idealista",
    cookieHeader: "datadome=worker",
    userAgent: "UA-worker",
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
  mocks.workerUpdateMany.mockResolvedValue({ count: 0 });
  mocks.globalUpdateMany.mockResolvedValue({ count: 0 });
  mocks.workerTransaction.mockImplementation(async (callback) =>
    callback({
      $executeRaw: mocks.workerExecuteRaw,
      portalWarmSession: {
        fields: { maxRequests: "maxRequests" },
        updateMany: mocks.workerUpdateMany,
        findFirst: mocks.workerFindFirst,
        create: mocks.workerCreate,
      },
    }),
  );
});

function buildWorkerPrisma(): WarmSessionPrismaClient {
  return {
    portalWarmSession: {
      fields: { maxRequests: "maxRequests" },
      updateMany: mocks.workerUpdateMany,
      findFirst: mocks.workerFindFirst,
      create: mocks.workerCreate,
    },
    $transaction: mocks.workerTransaction,
    $executeRaw: mocks.workerExecuteRaw,
  } as unknown as WarmSessionPrismaClient;
}

describe("createWarmSessionAcquire (Prisma inyectado)", () => {
  it("usa el cliente Prisma inyectado, NO el singleton del monolito", async () => {
    mocks.workerFindFirst.mockResolvedValueOnce(row());
    const acquire = createWarmSessionAcquire(buildWorkerPrisma());

    const result = await acquire(baseRequest);

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.warmed).toBe(false);
      expect(result.session.cookieHeader).toBe("datadome=worker");
    }
    // El cliente del worker debe haberse usado.
    expect(mocks.workerFindFirst).toHaveBeenCalledTimes(1);
    expect(mocks.workerUpdateMany).toHaveBeenCalled();
    // El cliente del monolito NO debe haberse tocado.
    expect(mocks.globalFindFirst).not.toHaveBeenCalled();
    expect(mocks.globalUpdateMany).not.toHaveBeenCalled();
    expect(mocks.globalTransaction).not.toHaveBeenCalled();
  });

  it("calienta y persiste sesion via cliente inyectado cuando no hay activa", async () => {
    mocks.workerFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    mocks.warmPortalSession.mockResolvedValue({
      cookieHeader: "datadome=fresh",
      userAgent: "UA-fresh",
      proxySession: "urus-market-prod",
    });
    mocks.workerCreate.mockResolvedValue(row({ cookieHeader: "datadome=fresh", userAgent: "UA-fresh" }));

    const acquire = createWarmSessionAcquire(buildWorkerPrisma());
    const result = await acquire(baseRequest);

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.warmed).toBe(true);
    }
    expect(mocks.workerTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.workerExecuteRaw).toHaveBeenCalled();
    expect(mocks.workerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cookieHeader: "datadome=fresh",
          userAgent: "UA-fresh",
          proxySession: "urus-market-prod",
        }),
      }),
    );
    // El monolito sigue intacto.
    expect(mocks.globalTransaction).not.toHaveBeenCalled();
    expect(mocks.globalCreate).not.toHaveBeenCalled();
  });

  it("dos clientes distintos (worker + monolito) coexisten sin interferencia", async () => {
    // Worker obtiene su sesion.
    mocks.workerFindFirst.mockResolvedValueOnce(row({ id: "worker-session" }));
    const workerAcquire = createWarmSessionAcquire(buildWorkerPrisma());
    const workerResult = await workerAcquire(baseRequest);
    expect(workerResult.status).toBe("ready");

    // Monolito habria tenido que llamar al singleton global; en este test
    // verificamos que el worker NO uso el singleton.
    expect(mocks.globalFindFirst).not.toHaveBeenCalled();
    expect(mocks.workerFindFirst).toHaveBeenCalledTimes(1);
  });
});
