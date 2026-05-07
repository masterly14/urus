import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createScrapingBrowserKit: vi.fn(),
  waitForBrightDataCaptcha: vi.fn(),
  acquireWarmSession: vi.fn(),
  incrementWarmSessionUsage: vi.fn(),
  invalidateWarmSession: vi.fn(),
}));

vi.mock("@/lib/scraping/browser", () => ({
  createScrapingBrowserKit: mocks.createScrapingBrowserKit,
}));

vi.mock("@/lib/scraping/brightdata-captcha", () => ({
  waitForBrightDataCaptcha: mocks.waitForBrightDataCaptcha,
}));

vi.mock("@/lib/scraping/warm-session", () => ({
  acquireWarmSession: mocks.acquireWarmSession,
  incrementWarmSessionUsage: mocks.incrementWarmSessionUsage,
  invalidateWarmSession: mocks.invalidateWarmSession,
}));

vi.mock("../config", () => ({
  getStatefoxImageImportConfig: () => ({
    enabled: true,
    syncOnFirstSeen: true,
    syncMaxComparables: 5,
    maxImages: 12,
    timeoutMs: 60_000,
    idealistaDelayMs: 0,
    headless: true,
    storageStatePath: undefined,
    brightDataUrl: "wss://brd.example",
    brightDataConnectTimeoutMs: 120_000,
    brightDataNetworkIdleTimeoutMs: 25_000,
    brightDataCaptchaDetectTimeoutMs: 20_000,
    brightDataCaptchaSolve: true,
    idealistaDirectCdpEnabled: true,
    warmSessionEnabled: true,
    warmSessionRequireCdp: true,
    warmSessionTtlMs: 4 * 60 * 60 * 1000,
    warmSessionMaxRequests: 40,
    humanBehaviorEnabled: false,
    warmupNavigationEnabled: true,
  }),
}));

import { discoverPortalImages } from "../extract";

function makeBrightDataKit(args?: {
  pageText?: string;
  responseStatus?: number;
  scriptText?: string;
}) {
  const responseListeners: Array<(response: { url: () => string; headers: () => Record<string, string> }) => void> = [];
  const cdpSession = {
    send: vi.fn(async (method: string) => {
      if (method === "Browser.getSessionId") return { sessionId: "stub-bd-session" };
      return {};
    }),
  };
  const context = {
    cookies: vi.fn(async () => []),
  };
  const page = {
    context: () => context,
    on: vi.fn((event: string, handler: never) => {
      if (event === "response") responseListeners.push(handler);
    }),
    goto: vi.fn(async () => ({
      status: () => args?.responseStatus ?? 200,
    })),
    waitForLoadState: vi.fn(async () => undefined),
    waitForTimeout: vi.fn(async () => undefined),
    getByRole: vi.fn(() => ({
      first: () => ({
        isVisible: vi.fn(async () => false),
        click: vi.fn(async () => undefined),
      }),
    })),
    locator: vi.fn(() => ({
      innerText: vi.fn(async () => args?.pageText ?? "Piso en venta"),
    })),
    evaluate: vi.fn(async () => [
      {
        url:
          args?.scriptText ??
          "https://img4.idealista.com/blur/WEB_LISTING/0/id.pro.es.image.master/foto.webp",
        source: "script",
      },
    ]),
  };

  return {
    mode: "brightdata" as const,
    browser: {
      close: vi.fn(async () => undefined),
      newBrowserCDPSession: vi.fn(async () => cdpSession),
    },
    context,
    page,
    responseListeners,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.waitForBrightDataCaptcha.mockResolvedValue({ status: "not_detected" });
});

describe("discoverPortalImages con Bright Data", () => {
  it("devuelve CAPTCHA si Bright Data reporta solve_failed", async () => {
    const kit = makeBrightDataKit();
    mocks.createScrapingBrowserKit.mockResolvedValueOnce(kit);
    mocks.waitForBrightDataCaptcha.mockResolvedValueOnce({
      status: "solve_failed",
      message: "captcha not solved",
    });

    const result = await discoverPortalImages("https://www.idealista.com/inmueble/1/");

    expect(result.status).toBe("captcha");
    expect(result.errorReason).toContain("captcha not solved");
    expect(mocks.waitForBrightDataCaptcha).toHaveBeenCalledWith(kit.page, 20_000);
    expect(kit.browser.close).toHaveBeenCalled();
  });

  it("continúa extrayendo si el comando CDP no está soportado", async () => {
    const kit = makeBrightDataKit();
    mocks.createScrapingBrowserKit.mockResolvedValueOnce(kit);
    mocks.waitForBrightDataCaptcha.mockResolvedValueOnce({
      status: "failed",
      message: "Unknown method",
    });

    const result = await discoverPortalImages("https://www.idealista.com/inmueble/1/");

    expect(result.status).toBe("ok");
    expect(result.candidates[0]?.url).toContain("img4.idealista.com");
  });

  it("usa timeout networkidle de Bright Data", async () => {
    const kit = makeBrightDataKit();
    mocks.createScrapingBrowserKit.mockResolvedValueOnce(kit);

    await discoverPortalImages("https://www.idealista.com/inmueble/1/");

    expect(kit.page.waitForLoadState).toHaveBeenCalledWith("networkidle", {
      timeout: 25_000,
    });
  });

  it("usa CDP directo en Idealista sin pasar por warm session ni residencial", async () => {
    const kit = makeBrightDataKit();
    mocks.createScrapingBrowserKit.mockResolvedValueOnce(kit);

    const result = await discoverPortalImages("https://www.idealista.com/inmueble/1/");

    expect(result.status).toBe("ok");
    expect(mocks.acquireWarmSession).not.toHaveBeenCalled();
    expect(mocks.createScrapingBrowserKit).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "idealista",
        brightDataUrl: "wss://brd.example",
      }),
    );
    expect(kit.page.goto).toHaveBeenCalledWith(
      "https://www.idealista.com/inmueble/1/",
      expect.objectContaining({
        waitUntil: "domcontentloaded",
        timeout: expect.any(Number),
      }),
    );
    const gotoOptions = (kit.page.goto.mock.calls[0]?.[1] ?? {}) as { timeout?: number };
    expect(gotoOptions.timeout).toBeGreaterThanOrEqual(120_000);
  });
});
