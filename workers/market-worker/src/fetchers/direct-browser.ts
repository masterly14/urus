/**
 * Fetcher de estrategia "direct-browser": Playwright Chromium directo,
 * sin proxy, con UA real, locale es-ES y aceptación de cookie banner.
 *
 * Es la estrategia preferida para portales laxos (Fotocasa, Pisos.com,
 * Milanuncios) por defecto. Se compone con `web-unlocker` y
 * `residential-proxy` en cadena cuando el portal empieza a bloquear.
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import {
  FetcherError,
  type DetailCaptureAction,
  type DetailCaptureFetcherResult,
  type Fetcher,
  type FetcherFetchOptions,
  type FetcherResult,
} from "./types";

const FOTOCASA_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface DirectBrowserFetcherOptions {
  headless: boolean;
  /** UA específico del portal. Default: UA tipo Fotocasa. */
  userAgent?: string;
  /** Locale ISO. Default: `es-ES`. */
  locale?: string;
  /** Timezone IANA. Default: `Europe/Madrid`. */
  timezone?: string;
  /** Selectores tipo regex para botones de aceptar cookies. */
  cookieBannerLabels?: RegExp[];
  /** Tiempo (ms) para esperar `networkidle` tras navegar. */
  networkIdleTimeoutMs?: number;
  /**
   * Si `true`, hace scroll programático hasta el fondo de la página tras
   * cargar. Necesario para portales con cards renderizadas client-side
   * y lazy-loaded (Fotocasa). Pisos.com NO lo necesita porque los
   * `ad-preview` están en el HTML inicial.
   */
  scrollToBottom?: boolean;
  /**
   * Selector CSS que indica "página hidratada". Si se proporciona, el
   * fetcher espera a que aparezca antes de leer el HTML. Útil para
   * sincronizar con SPAs o lazy-loaders.
   */
  hydratedSelector?: string;
  /**
   * Inyectable para tests: si se pasa, no se arranca Playwright real.
   * Recibe `pageUrl` y devuelve `{ html, httpStatus }`.
   */
  __launchOverride?: (pageUrl: string) => Promise<{ html: string; httpStatus: number | null }>;
}

const DEFAULT_COOKIE_LABELS = [/aceptar/i, /acepto/i, /accept/i, /vale/i, /continuar/i];

export function createDirectBrowserFetcher(opts: DirectBrowserFetcherOptions): Fetcher {
  return {
    name: "direct-browser",
    fetchHtml: async (pageUrl: string, fetchOpts) => {
      const startedAt = Date.now();
      try {
        if (opts.__launchOverride) {
          const overridden = await opts.__launchOverride(pageUrl);
          return {
            html: overridden.html,
            httpStatus: overridden.httpStatus,
            strategy: "direct-browser",
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
          networkIdleTimeoutMs: opts.networkIdleTimeoutMs ?? 20_000,
          timeoutMs: fetchOpts?.timeoutMs,
          scrollToBottom: opts.scrollToBottom ?? false,
          hydratedSelector: opts.hydratedSelector,
        });
        return {
          ...result,
          strategy: "direct-browser",
          elapsedMs: Date.now() - startedAt,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new FetcherError("NETWORK", message, "direct-browser");
      }
    },
    capture: async <T>(
      pageUrl: string,
      fetchOpts: FetcherFetchOptions,
      action: DetailCaptureAction<T>,
    ): Promise<DetailCaptureFetcherResult<T>> => {
      const startedAt = Date.now();
      let browser: Browser | undefined;
      let context: BrowserContext | undefined;
      let page: Page | undefined;
      try {
        browser = await chromium.launch({ headless: opts.headless });
        context = await browser.newContext({
          locale: opts.locale ?? "es-ES",
          timezoneId: opts.timezone ?? "Europe/Madrid",
          viewport: { width: 1366, height: 900 },
          userAgent: opts.userAgent ?? FOTOCASA_USER_AGENT,
          extraHTTPHeaders: { "Accept-Language": "es-ES,es;q=0.9,en;q=0.8" },
        });
        context.setDefaultTimeout(fetchOpts.timeoutMs ?? 45_000);
        page = await context.newPage();

        const response = await page.goto(pageUrl, {
          waitUntil: "domcontentloaded",
          timeout: fetchOpts.timeoutMs ?? 45_000,
        });
        const httpStatus = response?.status() ?? null;

        await acceptCookieBannerIfPresent(page, opts.cookieBannerLabels ?? DEFAULT_COOKIE_LABELS);
        await page
          .waitForLoadState("networkidle", { timeout: opts.networkIdleTimeoutMs ?? 15_000 })
          .catch(() => undefined);

        const beforeHtml = await page.content();

        const result = await action({
          page,
          beforeHtml,
          httpStatus,
          traceId: fetchOpts.traceId,
        });

        return {
          result,
          httpStatus,
          strategy: "direct-browser",
          elapsedMs: Date.now() - startedAt,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new FetcherError("NETWORK", message, "direct-browser");
      } finally {
        await page?.close().catch(() => undefined);
        await context?.close().catch(() => undefined);
        await browser?.close().catch(() => undefined);
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
  scrollToBottom: boolean;
  hydratedSelector?: string;
}

async function launchAndFetch(args: LaunchArgs): Promise<{ html: string; httpStatus: number | null }> {
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  try {
    browser = await chromium.launch({ headless: args.headless });
    context = await browser.newContext({
      locale: args.locale,
      timezoneId: args.timezone,
      viewport: { width: 1366, height: 900 },
      userAgent: args.userAgent,
      extraHTTPHeaders: {
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      },
    });
    context.setDefaultTimeout(args.timeoutMs ?? 45_000);
    page = await context.newPage();

    const response = await page.goto(args.pageUrl, {
      waitUntil: "domcontentloaded",
      timeout: args.timeoutMs ?? 30_000,
    });
    const httpStatus = response?.status() ?? null;

    await acceptCookieBannerIfPresent(page, args.cookieBannerLabels);
    await page
      .waitForLoadState("networkidle", { timeout: args.networkIdleTimeoutMs })
      .catch(() => undefined);

    if (args.hydratedSelector) {
      await page
        .waitForSelector(args.hydratedSelector, { timeout: 15_000, state: "attached" })
        .catch(() => undefined);
    }

    if (args.scrollToBottom) {
      await scrollPageToBottom(page);
      await page
        .waitForLoadState("networkidle", { timeout: 10_000 })
        .catch(() => undefined);
    }

    const html = await page.content();
    return { html, httpStatus };
  } finally {
    await page?.close().catch(() => undefined);
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}

/**
 * Scroll progresivo en pasos de 800px para activar IntersectionObserver
 * y lazy-loaders. Termina cuando la altura no crece dos ciclos seguidos
 * o tras `maxScrolls` iteraciones.
 */
async function scrollPageToBottom(page: Page): Promise<void> {
  await page
    .evaluate(async () => {
      const distance = 800;
      const delay = 350;
      const maxScrolls = 25;
      for (let i = 0; i < maxScrolls; i++) {
        const prev = document.documentElement.scrollHeight;
        window.scrollBy(0, distance);
        await new Promise((r) => setTimeout(r, delay));
        const curr = document.documentElement.scrollHeight;
        if (window.innerHeight + window.scrollY >= curr - 50 && curr === prev) {
          break;
        }
      }
      window.scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 300));
    })
    .catch(() => undefined);
}

async function acceptCookieBannerIfPresent(page: Page, labels: RegExp[]): Promise<void> {
  for (const label of labels) {
    const button = page.getByRole("button", { name: label }).first();
    if (!(await button.isVisible().catch(() => false))) continue;
    await button.click({ timeout: 2_500 }).catch(() => undefined);
    return;
  }
}
