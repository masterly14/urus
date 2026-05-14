import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  unlockUrl: vi.fn(),
  createScrapingBrowserKit: vi.fn(),
  acquireWarmSession: vi.fn(),
  incrementWarmSessionUsage: vi.fn(),
  invalidateWarmSession: vi.fn(),
  waitForBrightDataCaptcha: vi.fn(),
  fetchBrightDataSession: vi.fn(),
  getBrightDataSessionId: vi.fn(),
}));

vi.mock("@/lib/scraping/web-unlocker", () => ({
  unlockUrl: mocks.unlockUrl,
}));

vi.mock("@/lib/scraping/browser", () => ({
  createScrapingBrowserKit: mocks.createScrapingBrowserKit,
}));

vi.mock("@/lib/scraping/warm-session", () => ({
  acquireWarmSession: mocks.acquireWarmSession,
  incrementWarmSessionUsage: mocks.incrementWarmSessionUsage,
  invalidateWarmSession: mocks.invalidateWarmSession,
}));

vi.mock("@/lib/scraping/brightdata-captcha", () => ({
  waitForBrightDataCaptcha: mocks.waitForBrightDataCaptcha,
}));

vi.mock("@/lib/scraping/brightdata-session", () => ({
  fetchBrightDataSession: mocks.fetchBrightDataSession,
  getBrightDataSessionId: mocks.getBrightDataSessionId,
  formatBrightDataSessionSummary: vi.fn(() => "summary"),
}));

vi.mock("../config", () => ({
  getStatefoxImageImportConfig: () => ({
    enabled: true,
    syncOnFirstSeen: true,
    syncMaxComparables: 5,
    maxImages: 6,
    timeoutMs: 30_000,
    idealistaDelayMs: 0,
    headless: true,
    storageStatePath: undefined,
    brightDataUrl: undefined,
    brightDataApiToken: "test-token",
    brightDataSessionInspectEnabled: false,
    webUnlockerEnabled: true,
    webUnlockerZone: "urus_unlocker",
    webUnlockerCountry: "es",
    webUnlockerTimeoutMs: 60_000,
    brightDataConnectTimeoutMs: 120_000,
    brightDataNetworkIdleTimeoutMs: 25_000,
    brightDataCaptchaDetectTimeoutMs: 20_000,
    brightDataCaptchaSolve: false,
    idealistaDirectCdpEnabled: false,
    warmSessionEnabled: false,
    warmSessionRequireCdp: false,
    warmSessionTtlMs: 4 * 60 * 60 * 1000,
    warmSessionMaxRequests: 40,
    humanBehaviorEnabled: false,
    warmupNavigationEnabled: false,
  }),
}));

import { discoverPortalImages } from "../extract";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("discoverPortalImages con Web Unlocker", () => {
  it("descubre imágenes desde el HTML devuelto por Web Unlocker sin tocar Playwright", async () => {
    mocks.unlockUrl.mockResolvedValueOnce({
      ok: true,
      status: 200,
      html: '<html><body><img src="https://img4.idealista.com/blur/WEB_LISTING/0/id.pro.es.image.master/foto.webp"></body></html>',
    });

    const result = await discoverPortalImages("https://www.idealista.com/inmueble/1/");

    expect(result.status).toBe("ok");
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates[0]?.url).toContain("img4.idealista.com");
    expect(mocks.unlockUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://www.idealista.com/inmueble/1/",
        zone: "urus_unlocker",
        apiToken: "test-token",
        country: "es",
      }),
    );
    expect(mocks.createScrapingBrowserKit).not.toHaveBeenCalled();
    expect(mocks.acquireWarmSession).not.toHaveBeenCalled();
  });

  it("propaga blocked cuando Web Unlocker responde 403", async () => {
    mocks.unlockUrl.mockResolvedValueOnce({
      ok: false,
      status: 403,
      errorCode: "blocked",
      errorMessage: "Target blocked the request",
    });

    const result = await discoverPortalImages("https://www.idealista.com/inmueble/1/");

    expect(result.status).toBe("blocked");
    expect(result.errorReason).toContain("HTTP 403");
    expect(result.errorReason).toContain("blocked");
    expect(result.errorReason).toContain("Target blocked the request");
  });

  it("marca failed cuando Web Unlocker responde con un error sin status (network)", async () => {
    mocks.unlockUrl.mockResolvedValueOnce({
      ok: false,
      errorMessage: "fetch timeout",
    });

    const result = await discoverPortalImages("https://www.idealista.com/inmueble/1/");

    expect(result.status).toBe("failed");
    expect(result.errorReason).toContain("Web Unlocker");
    expect(result.errorReason).toContain("fetch timeout");
  });

  it("devuelve no_images_found si el HTML no contiene URLs de imágenes", async () => {
    mocks.unlockUrl.mockResolvedValueOnce({
      ok: true,
      status: 200,
      html: "<html><body><h1>Listado eliminado</h1></body></html>",
    });

    const result = await discoverPortalImages("https://www.idealista.com/inmueble/1/");

    expect(result.status).toBe("no_images_found");
    expect(result.candidates).toEqual([]);
  });
});
