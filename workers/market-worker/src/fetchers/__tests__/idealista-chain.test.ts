import { describe, expect, it, vi } from "vitest";
import { createIdealistaChain } from "../idealista-chain";
import { ChainExhausted } from "../chain";
import type { WarmSessionPrismaClient } from "../../../../../lib/scraping/warm-session";

function makePrismaStub(): WarmSessionPrismaClient {
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

function buildResponse(args: { ok?: boolean; status?: number; body: string; headers?: Record<string, string> }): Response {
  return {
    ok: args.ok ?? (args.status ?? 200) < 400,
    status: args.status ?? 200,
    statusText: "OK",
    headers: { get: (n: string) => args.headers?.[n.toLowerCase()] ?? null },
    text: async () => args.body,
  } as unknown as Response;
}

describe("createIdealistaChain", () => {
  it("Web Unlocker OK (no bloqueo) => devuelve HTML directamente sin tocar residencial", async () => {
    const wuFetch = vi.fn(async () =>
      buildResponse({ status: 200, body: "<html>" + "x".repeat(40_000) + "<a href='/inmueble/123/'>" + "</html>" }),
    ) as unknown as typeof fetch;
    const residentialLaunch = vi.fn(async () => ({ html: "<should-not-run>", httpStatus: 200 }));

    const chain = createIdealistaChain({
      webUnlocker: { apiToken: "tok", zone: "web_unlocker_market", country: "es", fetchImpl: wuFetch },
      residential: {
        prisma: makePrismaStub(),
        residentialProxyUrl: "http://brd.example",
        brightDataUrl: "wss://brd",
        policy,
        __acquireOverride: async () => ({ cookieHeader: "ck", userAgent: "UA", sessionId: "w1" }),
        __launchOverride: residentialLaunch,
      },
    });

    const r = await chain.fetchHtml("https://www.idealista.com/venta-viviendas/cordoba-cordoba/");
    expect(r.strategy).toBe("web-unlocker");
    expect(wuFetch).toHaveBeenCalledTimes(1);
    expect(residentialLaunch).not.toHaveBeenCalled();
  });

  it("Web Unlocker devuelve blocked (DataDome body) => cae al residencial y devuelve su HTML", async () => {
    const dataDomeBody =
      `<html><body><script>var dd={'rt':'c','host':'geo.captcha-delivery.com'}</script>` +
      `<script src="https://ct.captcha-delivery.com/c.js"></script></body></html>`;
    const wuFetch = vi.fn(async () => buildResponse({ status: 200, body: dataDomeBody })) as unknown as typeof fetch;
    const residentialLaunch = vi.fn(async () => ({
      html: "<html>" + "x".repeat(50_000) + "<a href='/inmueble/123/'>" + "</html>",
      httpStatus: 200,
    }));
    const fallbackEvents: unknown[] = [];

    const chain = createIdealistaChain({
      webUnlocker: { apiToken: "tok", zone: "web_unlocker_market", country: "es", fetchImpl: wuFetch },
      residential: {
        prisma: makePrismaStub(),
        residentialProxyUrl: "http://brd.example",
        brightDataUrl: "wss://brd",
        policy,
        __acquireOverride: async () => ({ cookieHeader: "ck", userAgent: "UA", sessionId: "w1" }),
        __launchOverride: residentialLaunch,
      },
      onFallback: (info) => fallbackEvents.push(info),
    });

    const r = await chain.fetchHtml("https://www.idealista.com/venta-viviendas/cordoba-cordoba/");
    expect(r.strategy).toBe("idealista-residential");
    expect(wuFetch).toHaveBeenCalledTimes(1);
    expect(residentialLaunch).toHaveBeenCalledTimes(1);
    expect(fallbackEvents).toHaveLength(1);
    expect(fallbackEvents[0]).toMatchObject({
      fromStrategy: "web-unlocker",
      toStrategy: "idealista-residential",
      reason: expect.stringContaining("datadome"),
    });
  });

  it("Web Unlocker bloqueado + residencial bloqueado => ChainExhausted", async () => {
    const dataDomeBody =
      `<html><body>Please enable JS and disable any ad blocker` +
      `<script>var dd={'rt':'c'}</script></body></html>`;
    const wuFetch = vi.fn(async () => buildResponse({ status: 200, body: dataDomeBody })) as unknown as typeof fetch;
    // El residencial lanza FetcherError UNAUTHORIZED por HTTP 403.
    const residentialLaunch = vi.fn(async () => {
      throw new Error("HTTP 403"); // desde dentro del fetcher se reescribe a FetcherError NETWORK
    });

    const chain = createIdealistaChain({
      webUnlocker: { apiToken: "tok", zone: "web_unlocker_market", country: "es", fetchImpl: wuFetch },
      residential: {
        prisma: makePrismaStub(),
        residentialProxyUrl: "http://brd.example",
        brightDataUrl: "wss://brd",
        policy,
        __acquireOverride: async () => ({ cookieHeader: "ck", userAgent: "UA", sessionId: "w1" }),
        __launchOverride: residentialLaunch,
        __invalidateOverride: async () => undefined,
      },
    });

    await expect(chain.fetchHtml("https://www.idealista.com/x")).rejects.toBeInstanceOf(ChainExhausted);
    expect(wuFetch).toHaveBeenCalledTimes(1);
    expect(residentialLaunch).toHaveBeenCalledTimes(1);
  });

  it("Web Unlocker devuelve HTTP 403 (HTTP_ERROR) => cae al residencial y aporta su HTML", async () => {
    const wuFetch = vi.fn(async () =>
      buildResponse({ status: 500, ok: false, body: "boom" }),
    ) as unknown as typeof fetch;
    const residentialLaunch = vi.fn(async () => ({
      html: "<html>" + "x".repeat(50_000) + "<a href='/inmueble/123/'>" + "</html>",
      httpStatus: 200,
    }));

    const chain = createIdealistaChain({
      webUnlocker: { apiToken: "tok", zone: "web_unlocker_market", country: "es", fetchImpl: wuFetch },
      residential: {
        prisma: makePrismaStub(),
        residentialProxyUrl: "http://brd.example",
        brightDataUrl: "wss://brd",
        policy,
        __acquireOverride: async () => ({ cookieHeader: "ck", userAgent: "UA", sessionId: "w1" }),
        __launchOverride: residentialLaunch,
      },
    });

    const r = await chain.fetchHtml("https://www.idealista.com/x");
    expect(r.strategy).toBe("idealista-residential");
  });
});
