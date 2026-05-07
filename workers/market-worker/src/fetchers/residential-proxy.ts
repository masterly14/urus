/**
 * Fetcher de estrategia "residential-proxy": Playwright Chromium con
 * proxy residencial Bright Data. Cuando ni `direct-browser` ni
 * `web-unlocker` funcionan, esta es la última línea (más cara y lenta,
 * pero IPs limpias y JS ejecutado).
 *
 * Acepta credenciales por dos vías equivalentes (decisión: la primera
 * que esté completa gana):
 *   1. URL completa con user:pass embebido en `proxyUrl`.
 *   2. `proxyUrl` + `username` + `password` por separado.
 *
 * Si se pasa `session`, se anexa al username con el patrón
 * `<user>-session-<sessionId>` (convención de Bright Data para
 * pegado de sticky session).
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { FetcherError, type Fetcher, type FetcherResult } from "./types";

const FOTOCASA_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface ResidentialProxyFetcherOptions {
  proxyUrl: string;
  username?: string;
  password?: string;
  /** Sticky session id (opcional). */
  session?: string;
  headless: boolean;
  userAgent?: string;
  locale?: string;
  timezone?: string;
  cookieBannerLabels?: RegExp[];
  networkIdleTimeoutMs?: number;
  /** Inyectable para tests; bypasea Playwright real. */
  __launchOverride?: (pageUrl: string) => Promise<{ html: string; httpStatus: number | null }>;
}

const DEFAULT_COOKIE_LABELS = [/aceptar/i, /acepto/i, /accept/i, /vale/i, /continuar/i];

interface ParsedProxy {
  server: string;
  username?: string;
  password?: string;
}

function parseProxyUrl(rawUrl: string): ParsedProxy {
  try {
    const url = new URL(rawUrl);
    const username = url.username ? decodeURIComponent(url.username) : undefined;
    const password = url.password ? decodeURIComponent(url.password) : undefined;
    url.username = "";
    url.password = "";
    return {
      server: url.toString().replace(/\/$/, ""),
      username,
      password,
    };
  } catch {
    return { server: rawUrl };
  }
}

function withSession(username: string | undefined, session: string | undefined): string | undefined {
  if (!username || !session) return username;
  if (username.includes("-session-")) return username;
  return `${username}-session-${session}`;
}

export function createResidentialProxyFetcher(
  opts: ResidentialProxyFetcherOptions,
): Fetcher {
  if (!opts.proxyUrl) {
    throw new FetcherError(
      "MISCONFIGURED",
      "createResidentialProxyFetcher requiere proxyUrl",
      "residential-proxy",
    );
  }
  const parsed = parseProxyUrl(opts.proxyUrl);
  const username = withSession(opts.username ?? parsed.username, opts.session);
  const password = opts.password ?? parsed.password;

  return {
    name: "residential-proxy",
    fetchHtml: async (pageUrl: string, fetchOpts): Promise<FetcherResult> => {
      const startedAt = Date.now();
      try {
        if (opts.__launchOverride) {
          const overridden = await opts.__launchOverride(pageUrl);
          return {
            html: overridden.html,
            httpStatus: overridden.httpStatus,
            strategy: "residential-proxy",
            elapsedMs: Date.now() - startedAt,
          };
        }
        const result = await launchAndFetch({
          pageUrl,
          headless: opts.headless,
          userAgent: opts.userAgent ?? FOTOCASA_USER_AGENT,
          locale: opts.locale ?? "es-ES",
          timezone: opts.timezone ?? "Europe/Madrid",
          cookieBannerLabels: opts.cookieBannerLabels ?? DEFAULT_COOKIE_LABELS,
          networkIdleTimeoutMs: opts.networkIdleTimeoutMs ?? 25_000,
          timeoutMs: fetchOpts?.timeoutMs,
          proxy: { server: parsed.server, username, password },
        });
        return {
          ...result,
          strategy: "residential-proxy",
          elapsedMs: Date.now() - startedAt,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new FetcherError("NETWORK", message, "residential-proxy");
      }
    },
  };
}

interface LaunchArgs {
  pageUrl: string;
  headless: boolean;
  userAgent: string;
  locale: string;
  timezone: string;
  cookieBannerLabels: RegExp[];
  networkIdleTimeoutMs: number;
  timeoutMs?: number;
  proxy: { server: string; username?: string; password?: string };
}

async function launchAndFetch(args: LaunchArgs): Promise<{ html: string; httpStatus: number | null }> {
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  try {
    browser = await chromium.launch({
      headless: args.headless,
      proxy: {
        server: args.proxy.server,
        username: args.proxy.username,
        password: args.proxy.password,
      },
    });
    context = await browser.newContext({
      locale: args.locale,
      timezoneId: args.timezone,
      viewport: { width: 1366, height: 900 },
      userAgent: args.userAgent,
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: {
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      },
    });
    context.setDefaultTimeout(args.timeoutMs ?? 60_000);
    page = await context.newPage();

    const response = await page.goto(args.pageUrl, {
      waitUntil: "domcontentloaded",
      timeout: args.timeoutMs ?? 45_000,
    });
    const httpStatus = response?.status() ?? null;

    for (const label of args.cookieBannerLabels) {
      const button = page.getByRole("button", { name: label }).first();
      if (await button.isVisible().catch(() => false)) {
        await button.click({ timeout: 2_500 }).catch(() => undefined);
        break;
      }
    }
    await page
      .waitForLoadState("networkidle", { timeout: args.networkIdleTimeoutMs })
      .catch(() => undefined);

    const html = await page.content();
    return { html, httpStatus };
  } finally {
    await page?.close().catch(() => undefined);
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}
