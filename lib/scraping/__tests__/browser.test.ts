import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  launch: vi.fn(),
  connectOverCDP: vi.fn(),
  localNewContext: vi.fn(),
  localNewPage: vi.fn(),
  localAddCookies: vi.fn(),
  brightNewPage: vi.fn(),
  brightContextSetDefaultTimeout: vi.fn(),
}));

vi.mock("playwright", () => ({
  chromium: {
    launch: mocks.launch,
    connectOverCDP: mocks.connectOverCDP,
  },
}));

vi.mock("@/lib/idealista/browser", () => ({
  createIdealistaBrowser: vi.fn(async () => ({
    browser: { close: vi.fn() },
    context: { setDefaultTimeout: vi.fn(), pages: () => [] },
    page: { url: () => "about:blank" },
  })),
}));

import { chromium } from "playwright";
import { createIdealistaBrowser } from "@/lib/idealista/browser";
import { createScrapingBrowserKit } from "../browser";

const mockedChromium = vi.mocked(chromium);
const mockedCreateIdealistaBrowser = vi.mocked(createIdealistaBrowser);

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.BRIGHTDATA_SCRAPING_BROWSER_URL;
  delete process.env.BRIGHTDATA_RESIDENTIAL_PROXY_URL;
  delete process.env.BRIGHTDATA_RESIDENTIAL_PROXY_USERNAME;
  delete process.env.BRIGHTDATA_RESIDENTIAL_PROXY_PASSWORD;
  delete process.env.BRIGHTDATA_RESIDENTIAL_PROXY_SESSION;
  delete process.env.BRIGHTDATA_CDP_CONNECT_TIMEOUT_MS;
  delete process.env.IDEALISTA_PROXY_SERVER;
  delete process.env.IDEALISTA_PROXY_USERNAME;
  delete process.env.IDEALISTA_PROXY_PASSWORD;

  mocks.localNewPage.mockResolvedValue({ url: () => "about:blank" });
  mocks.localNewContext.mockResolvedValue({
    setDefaultTimeout: vi.fn(),
    newPage: mocks.localNewPage,
    addCookies: mocks.localAddCookies,
  });
  mocks.launch.mockResolvedValue({
    newContext: mocks.localNewContext,
    close: vi.fn(),
  });

  const brightContext = {
    setDefaultTimeout: mocks.brightContextSetDefaultTimeout,
  };
  mocks.brightNewPage.mockResolvedValue({
    url: () => "about:blank",
    context: () => brightContext,
  });
  mocks.connectOverCDP.mockResolvedValue({
    newPage: mocks.brightNewPage,
    close: vi.fn(),
  });
});

describe("createScrapingBrowserKit", () => {
  it("usa createIdealistaBrowser en modo local para Idealista", async () => {
    const kit = await createScrapingBrowserKit({
      source: "idealista",
      headless: true,
      storageStatePath: "./storage/idealista-state.json",
    });

    expect(kit.mode).toBe("local");
    expect(mockedCreateIdealistaBrowser).toHaveBeenCalledWith(
      true,
      "./storage/idealista-state.json",
    );
    expect(mockedChromium.connectOverCDP).not.toHaveBeenCalled();
  });

  it("usa Bright Data Residential Proxy para Idealista si no hay CDP URL", async () => {
    process.env.BRIGHTDATA_RESIDENTIAL_PROXY_URL = "http://brd.example:33335";
    process.env.BRIGHTDATA_RESIDENTIAL_PROXY_USERNAME = "brd-user";
    process.env.BRIGHTDATA_RESIDENTIAL_PROXY_PASSWORD = "brd-pass";

    const kit = await createScrapingBrowserKit({
      source: "idealista",
      headless: true,
      storageStatePath: "./storage/ignored.json",
    });

    expect(kit.mode).toBe("local");
    expect(mockedCreateIdealistaBrowser).not.toHaveBeenCalled();
    expect(mockedChromium.launch).toHaveBeenCalledWith({
      headless: true,
      proxy: {
        server: "http://brd.example:33335",
        username: "brd-user",
        password: "brd-pass",
      },
    });
    expect(mocks.localNewContext).toHaveBeenCalledWith(
      expect.objectContaining({
        ignoreHTTPSErrors: true,
      }),
    );
  });

  it("separa credenciales embebidas en la URL del proxy Bright Data", async () => {
    process.env.BRIGHTDATA_RESIDENTIAL_PROXY_URL =
      "http://brd-user:brd-pass@brd.example:33335";

    await createScrapingBrowserKit({
      source: "fotocasa",
      headless: true,
    });

    expect(mockedChromium.launch).toHaveBeenCalledWith({
      headless: true,
      proxy: {
        server: "http://brd.example:33335",
        username: "brd-user",
        password: "brd-pass",
      },
    });
  });

  it("añade sesión sticky al usuario Bright Data cuando se configura", async () => {
    process.env.BRIGHTDATA_RESIDENTIAL_PROXY_URL = "http://brd.example:33335";
    process.env.BRIGHTDATA_RESIDENTIAL_PROXY_USERNAME = "brd-user";
    process.env.BRIGHTDATA_RESIDENTIAL_PROXY_PASSWORD = "brd-pass";
    process.env.BRIGHTDATA_RESIDENTIAL_PROXY_SESSION = "urus-dev";

    await createScrapingBrowserKit({
      source: "idealista",
      headless: true,
    });

    expect(mockedChromium.launch).toHaveBeenCalledWith({
      headless: true,
      proxy: {
        server: "http://brd.example:33335",
        username: "brd-user-session-urus-dev",
        password: "brd-pass",
      },
    });
  });

  it("usa chromium.launch en local genérico y propaga proxy env", async () => {
    process.env.IDEALISTA_PROXY_SERVER = "http://proxy.example:8080";
    process.env.IDEALISTA_PROXY_USERNAME = "user";
    process.env.IDEALISTA_PROXY_PASSWORD = "pass";

    const kit = await createScrapingBrowserKit({
      source: "fotocasa",
      headless: false,
    });

    expect(kit.mode).toBe("local");
    expect(mockedChromium.launch).toHaveBeenCalledWith({
      headless: false,
      proxy: {
        server: "http://proxy.example:8080",
        username: "user",
        password: "pass",
      },
    });
    expect(mocks.localNewContext).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: "es-ES",
        timezoneId: "Europe/Madrid",
        viewport: { width: 1366, height: 900 },
        userAgent: expect.stringContaining("Chrome/124"),
      }),
    );
  });

  it("inyecta cookies y userAgent al crear contexto local", async () => {
    await createScrapingBrowserKit({
      source: "idealista",
      headless: true,
      brightDataResidentialProxyUrl: "http://brd.example:33335",
      cookieHeader: "datadome=abc; other=value",
      cookieUrl: "https://www.idealista.com/",
      userAgent: "Mozilla/5.0 warmed",
    });

    expect(mocks.localNewContext).toHaveBeenCalledWith(
      expect.objectContaining({
        userAgent: "Mozilla/5.0 warmed",
      }),
    );
    expect(mocks.localAddCookies).toHaveBeenCalledWith([
      {
        name: "datadome",
        value: "abc",
        url: "https://www.idealista.com/",
        secure: true,
        sameSite: "Lax",
      },
      {
        name: "other",
        value: "value",
        url: "https://www.idealista.com/",
        secure: true,
        sameSite: "Lax",
      },
    ]);
  });

  it("usa Bright Data connectOverCDP cuando hay URL configurada", async () => {
    process.env.BRIGHTDATA_SCRAPING_BROWSER_URL = "wss://brd.example";
    process.env.BRIGHTDATA_CDP_CONNECT_TIMEOUT_MS = "123456";

    const kit = await createScrapingBrowserKit({
      source: "idealista",
      headless: true,
      storageStatePath: "./storage/ignored.json",
    });

    expect(kit.mode).toBe("brightdata");
    expect(mockedChromium.connectOverCDP).toHaveBeenCalledWith("wss://brd.example", {
      timeout: 123456,
    });
    expect(mockedCreateIdealistaBrowser).not.toHaveBeenCalled();
    expect(mocks.brightNewPage).toHaveBeenCalledTimes(1);
  });

  it("usa browser.newPage en CDP en vez de touchear contextos preexistentes", async () => {
    process.env.BRIGHTDATA_SCRAPING_BROWSER_URL = "wss://brd.example";

    const kit = await createScrapingBrowserKit({
      source: "idealista",
      headless: true,
    });

    expect(mocks.brightNewPage).toHaveBeenCalledTimes(1);
    expect(kit.context).toBe(kit.page.context());
    expect(mocks.brightContextSetDefaultTimeout).toHaveBeenCalledWith(45_000);
  });
});
