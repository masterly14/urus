import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { StatefoxPortalSource } from "@prisma/client";
import { createIdealistaBrowser } from "@/lib/idealista/browser";
import { IDEALISTA_USER_AGENT } from "@/lib/idealista/config";
import { FOTOCASA_USER_AGENT } from "@/lib/fotocasa/config";
import { parseCookieHeader } from "@/lib/scraping/cookies";

export type ScrapingBrowserMode = "brightdata" | "local";

export type ScrapingBrowserKit = {
  mode: ScrapingBrowserMode;
  browser: Browser;
  context: BrowserContext;
  page: Page;
};

export type CreateScrapingBrowserKitOptions = {
  source: Exclude<StatefoxPortalSource, "unknown">;
  headless: boolean;
  storageStatePath?: string;
  brightDataUrl?: string;
  brightDataResidentialProxyUrl?: string;
  brightDataResidentialProxyUsername?: string;
  brightDataResidentialProxyPassword?: string;
  brightDataResidentialProxySession?: string;
  brightDataConnectTimeoutMs?: number;
  cookieHeader?: string;
  cookieUrl?: string;
  userAgent?: string;
};

const DEFAULT_BRIGHTDATA_CONNECT_TIMEOUT_MS = 120_000;
const DEFAULT_CONTEXT_TIMEOUT_MS = 45_000;

function envTrim(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function userAgentForSource(source: StatefoxPortalSource): string {
  return source === "fotocasa" ? FOTOCASA_USER_AGENT : IDEALISTA_USER_AGENT;
}

type ProxySettings = {
  server: string;
  username?: string;
  password?: string;
  ignoreHTTPSErrors?: boolean;
};

function parseProxyUrl(raw: string, ignoreHTTPSErrors = false): ProxySettings {
  try {
    const parsed = new URL(raw);
    const username = parsed.username ? decodeURIComponent(parsed.username) : undefined;
    const password = parsed.password ? decodeURIComponent(parsed.password) : undefined;
    parsed.username = "";
    parsed.password = "";
    return {
      server: parsed.toString().replace(/\/$/, ""),
      username,
      password,
      ignoreHTTPSErrors,
    };
  } catch {
    return { server: raw, ignoreHTTPSErrors };
  }
}

function withBrightDataSession(username: string | undefined, session: string | undefined) {
  if (!username || !session || username.includes("-session-")) return username;
  return `${username}-session-${session}`;
}

function resolveBrightDataResidentialProxy(
  options: Pick<
    CreateScrapingBrowserKitOptions,
    | "brightDataResidentialProxyUrl"
    | "brightDataResidentialProxyUsername"
    | "brightDataResidentialProxyPassword"
    | "brightDataResidentialProxySession"
  >,
): ProxySettings | undefined {
  const proxyUrl =
    options.brightDataResidentialProxyUrl ?? envTrim("BRIGHTDATA_RESIDENTIAL_PROXY_URL");
  if (!proxyUrl) return undefined;
  const parsed = parseProxyUrl(proxyUrl, true);
  const username =
    options.brightDataResidentialProxyUsername ??
    envTrim("BRIGHTDATA_RESIDENTIAL_PROXY_USERNAME") ??
    parsed.username;
  const session =
    options.brightDataResidentialProxySession ??
    envTrim("BRIGHTDATA_RESIDENTIAL_PROXY_SESSION");
  return {
    ...parsed,
    username: withBrightDataSession(username, session),
    password:
      options.brightDataResidentialProxyPassword ??
      envTrim("BRIGHTDATA_RESIDENTIAL_PROXY_PASSWORD") ??
      parsed.password,
  };
}

function resolveLegacyProxy(): ProxySettings | undefined {
  const proxyUrl = envTrim("IDEALISTA_PROXY_SERVER");
  if (!proxyUrl) return undefined;
  const parsed = parseProxyUrl(proxyUrl);
  return {
    ...parsed,
    username: envTrim("IDEALISTA_PROXY_USERNAME") ?? parsed.username,
    password: envTrim("IDEALISTA_PROXY_PASSWORD") ?? parsed.password,
  };
}

async function createBrightDataKit(
  url: string,
  timeoutMs: number,
): Promise<ScrapingBrowserKit> {
  const browser = await chromium.connectOverCDP(url, { timeout: timeoutMs });
  const page = await browser.newPage();
  const context = page.context();
  context.setDefaultTimeout(DEFAULT_CONTEXT_TIMEOUT_MS);
  return { mode: "brightdata", browser, context, page };
}

async function createLocalGenericBrowser(args: {
  source: Exclude<StatefoxPortalSource, "unknown">;
  headless: boolean;
  proxy?: ProxySettings;
  cookieHeader?: string;
  cookieUrl?: string;
  userAgent?: string;
}): Promise<ScrapingBrowserKit> {
  const proxy = args.proxy ?? resolveBrightDataResidentialProxy({}) ?? resolveLegacyProxy();
  const browser = await chromium.launch({
    headless: args.headless,
    ...(proxy
      ? {
          proxy: {
            server: proxy.server,
            username: proxy.username,
            password: proxy.password,
          },
        }
      : {}),
  });
  const context = await browser.newContext({
    locale: "es-ES",
    timezoneId: "Europe/Madrid",
    viewport: { width: 1366, height: 900 },
    userAgent: args.userAgent ?? userAgentForSource(args.source),
    ...(proxy?.ignoreHTTPSErrors ? { ignoreHTTPSErrors: true } : {}),
    extraHTTPHeaders: {
      "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    },
  });
  if (args.cookieHeader && args.cookieUrl) {
    await context.addCookies(parseCookieHeader(args.cookieHeader, args.cookieUrl));
  }
  context.setDefaultTimeout(DEFAULT_CONTEXT_TIMEOUT_MS);
  return { mode: "local", browser, context, page: await context.newPage() };
}

export async function createScrapingBrowserKit(
  options: CreateScrapingBrowserKitOptions,
): Promise<ScrapingBrowserKit> {
  const brightDataUrl = options.brightDataUrl ?? envTrim("BRIGHTDATA_SCRAPING_BROWSER_URL");
  const brightDataResidentialProxy = resolveBrightDataResidentialProxy(options);
  if (brightDataUrl) {
    const timeoutMs =
      options.brightDataConnectTimeoutMs ??
      envNumber("BRIGHTDATA_CDP_CONNECT_TIMEOUT_MS", DEFAULT_BRIGHTDATA_CONNECT_TIMEOUT_MS);
    return createBrightDataKit(brightDataUrl, timeoutMs);
  }

  if (options.source === "idealista") {
    if (!brightDataResidentialProxy) {
      const kit = await createIdealistaBrowser(options.headless, options.storageStatePath);
      return { mode: "local", ...kit };
    }
    return createLocalGenericBrowser({
      source: options.source,
      headless: options.headless,
      proxy: brightDataResidentialProxy,
      cookieHeader: options.cookieHeader,
      cookieUrl: options.cookieUrl,
      userAgent: options.userAgent,
    });
  }

  return createLocalGenericBrowser({
    source: options.source,
    headless: options.headless,
    proxy: brightDataResidentialProxy,
    cookieHeader: options.cookieHeader,
    cookieUrl: options.cookieUrl,
    userAgent: options.userAgent,
  });
}
