import { describe, expect, it, vi } from "vitest";
import { createIdealistaResidentialFetcher } from "../idealista-residential";
import { FetcherError } from "../types";
import type { WarmSessionPrismaClient } from "../../../../../lib/scraping/warm-session";

function makePrismaStub(): WarmSessionPrismaClient {
  // Stub minimo: solo necesitamos que `createWarmSessionRepo(prisma)` y
  // `createWarmSessionAcquire(prisma)` no fallen en construccion. Los
  // metodos reales de Prisma se interceptan via __acquireOverride y
  // __invalidateOverride en los tests.
  return {
    portalWarmSession: {
      fields: { maxRequests: "maxRequests" },
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
  } as unknown as WarmSessionPrismaClient;
}

const policy = {
  enabled: true,
  requireCdp: true,
  ttlMs: 4 * 60 * 60 * 1000,
  maxRequests: 40,
};

describe("createIdealistaResidentialFetcher", () => {
  it("falla si no se pasa prisma", () => {
    expect(() =>
      // @ts-expect-error testando guard
      createIdealistaResidentialFetcher({
        residentialProxyUrl: "http://brd.example",
        brightDataUrl: "wss://brd",
        policy,
      }),
    ).toThrow(FetcherError);
  });

  it("falla si no se pasa residentialProxyUrl", () => {
    expect(() =>
      createIdealistaResidentialFetcher({
        prisma: makePrismaStub(),
        residentialProxyUrl: "",
        brightDataUrl: "wss://brd",
        policy,
      }),
    ).toThrow(FetcherError);
  });

  it("falla si no se pasa brightDataUrl (warm-up CDP) ni override de tests", () => {
    expect(() =>
      createIdealistaResidentialFetcher({
        prisma: makePrismaStub(),
        residentialProxyUrl: "http://brd.example",
        policy,
      }),
    ).toThrow(/brightDataUrl/);
  });

  it("usa override de adquisicion + browser y devuelve HTML", async () => {
    const launchSpy = vi.fn(async (url: string, ctx: { cookieHeader: string; userAgent: string }) => {
      expect(url).toContain("idealista.com");
      expect(ctx.cookieHeader).toBe("datadome=fresh");
      expect(ctx.userAgent).toBe("UA-fresh");
      return { html: "<html>ok</html>", httpStatus: 200 };
    });
    const fetcher = createIdealistaResidentialFetcher({
      prisma: makePrismaStub(),
      residentialProxyUrl: "http://brd.example",
      brightDataUrl: "wss://brd",
      policy,
      __acquireOverride: async () => ({
        cookieHeader: "datadome=fresh",
        userAgent: "UA-fresh",
        sessionId: "warm_1",
      }),
      __launchOverride: launchSpy,
    });

    const result = await fetcher.fetchHtml("https://www.idealista.com/venta-viviendas/cordoba-cordoba/");
    expect(result.html).toBe("<html>ok</html>");
    expect(result.httpStatus).toBe(200);
    expect(result.strategy).toBe("idealista-residential");
    expect(launchSpy).toHaveBeenCalledTimes(1);
  });

  it("invalida la sesion warm y lanza FetcherError si el override lanza", async () => {
    const invalidateSpy = vi.fn(async () => undefined);
    const fetcher = createIdealistaResidentialFetcher({
      prisma: makePrismaStub(),
      residentialProxyUrl: "http://brd.example",
      brightDataUrl: "wss://brd",
      policy,
      __acquireOverride: async () => ({
        cookieHeader: "ck",
        userAgent: "UA",
        sessionId: "warm_1",
      }),
      __launchOverride: async () => {
        throw new Error("playwright timeout");
      },
      __invalidateOverride: invalidateSpy,
    });

    await expect(fetcher.fetchHtml("https://www.idealista.com/x")).rejects.toMatchObject({
      name: "FetcherError",
      code: "NETWORK",
      strategy: "idealista-residential",
    });
    expect(invalidateSpy).toHaveBeenCalledWith("warm_1", expect.stringContaining("playwright timeout"));
  });
});
