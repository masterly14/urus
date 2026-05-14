/**
 * Fetcher residencial para Idealista (fallback de la chain Fase 2.c).
 *
 * Estrategia (decisiones.md §11.3):
 *  1. Adquiere una warm session de Idealista via `createWarmSessionAcquire`
 *     (con el `PrismaClient` del Worker). Reusa cookies cacheadas si las
 *     hay, calienta nuevas via Bright Data Browser API (CDP) si no.
 *  2. Abre Playwright local con **proxy residencial** Bright Data (NO CDP)
 *     e inyecta las cookies warm en el contexto.
 *  3. Navega a la URL de listado, espera networkidle, devuelve HTML.
 *  4. Si el HTML viene bloqueado o hay 401/403/429: invalida la warm
 *     session y lanza FetcherError para que la chain abra el breaker.
 *
 * Importante: el warm-up de cookies (paso 1) usa CDP **solo** contra la
 * home de Idealista. La pagina de listado se carga via proxy residencial
 * con las cookies ya inyectadas. Esta separacion es lo que hace que
 * DataDome no tumbe la sesion (validacion operativa: docs/statefox-image-cache.md).
 */

import {
  createWarmSessionAcquire,
  homeUrlForWarmSession,
  type WarmSessionPolicy,
  type WarmSessionPrismaClient,
  type WarmSessionRepo,
  createWarmSessionRepo,
} from "../../../../lib/scraping/warm-session";
import { createScrapingBrowserKit } from "../../../../lib/scraping/browser";
import {
  FetcherError,
  type DetailCaptureAction,
  type DetailCaptureFetcherResult,
  type Fetcher,
  type FetcherFetchOptions,
  type FetcherResult,
} from "./types";

export interface IdealistaResidentialFetcherOptions {
  /** PrismaClient del Worker (Railway). NO es el singleton del monolito. */
  prisma: WarmSessionPrismaClient;
  /** URL CDP de Bright Data Browser API (solo para warm-up de cookies). */
  brightDataUrl?: string;
  /** URL del proxy residencial Bright Data (con o sin user:pass embebidos). */
  residentialProxyUrl: string;
  residentialProxyUsername?: string;
  residentialProxyPassword?: string;
  /** Sticky session id Bright Data (urus-market-prod, etc.). */
  residentialProxySession?: string;
  /** Politica del warm-session (TTL, max requests, captcha solve, etc.). */
  policy: WarmSessionPolicy;
  /** Captcha solve durante warm-up. Default true. */
  captchaSolveEnabled?: boolean;
  captchaDetectTimeoutMs?: number;
  /** Headless de Playwright. Default true. */
  headless?: boolean;
  /** Connect timeout para CDP de warm-up. */
  brightDataConnectTimeoutMs?: number;
  /** Timeout networkidle al cargar la URL de listado. Default 25s. */
  networkIdleTimeoutMs?: number;
  /**
   * Override de la creacion del browser (solo para tests). Si se pasa,
   * salta `createScrapingBrowserKit` y devuelve directamente un par
   * (html, httpStatus). Permite testear el fetcher sin Playwright real.
   */
  __launchOverride?: (pageUrl: string, ctx: { cookieHeader: string; userAgent: string }) => Promise<{
    html: string;
    httpStatus: number | null;
  }>;
  /** Override de adquisicion warm para tests. */
  __acquireOverride?: (source: "idealista") => Promise<{
    cookieHeader: string;
    userAgent: string;
    sessionId: string;
  }>;
  /** Hook para invalidar sesion en bloqueo (solo tests). */
  __invalidateOverride?: (sessionId: string, reason: string) => Promise<void>;
}

const DEFAULT_NETWORK_IDLE_TIMEOUT_MS = 25_000;
const DEFAULT_BRIGHTDATA_CONNECT_TIMEOUT_MS = 120_000;

export function createIdealistaResidentialFetcher(
  opts: IdealistaResidentialFetcherOptions,
): Fetcher {
  if (!opts.prisma) {
    throw new FetcherError(
      "MISCONFIGURED",
      "createIdealistaResidentialFetcher requiere prisma",
      "idealista-residential",
    );
  }
  if (!opts.residentialProxyUrl) {
    throw new FetcherError(
      "MISCONFIGURED",
      "createIdealistaResidentialFetcher requiere residentialProxyUrl",
      "idealista-residential",
    );
  }
  if (!opts.brightDataUrl && !opts.__acquireOverride) {
    throw new FetcherError(
      "MISCONFIGURED",
      "createIdealistaResidentialFetcher requiere brightDataUrl (para warm-up CDP)",
      "idealista-residential",
    );
  }

  const repo: WarmSessionRepo = createWarmSessionRepo(opts.prisma);
  const acquire = createWarmSessionAcquire(opts.prisma);
  const headless = opts.headless ?? true;
  const networkIdleTimeoutMs = opts.networkIdleTimeoutMs ?? DEFAULT_NETWORK_IDLE_TIMEOUT_MS;
  const brightDataConnectTimeoutMs =
    opts.brightDataConnectTimeoutMs ?? DEFAULT_BRIGHTDATA_CONNECT_TIMEOUT_MS;

  return {
    name: "idealista-residential",
    fetchHtml: async (pageUrl: string, fetchOpts): Promise<FetcherResult> => {
      const startedAt = Date.now();

      // 1) Adquirir warm session (cookies + UA). Test override gana.
      let warmSessionId: string;
      let cookieHeader: string;
      let userAgent: string;
      if (opts.__acquireOverride) {
        const w = await opts.__acquireOverride("idealista");
        warmSessionId = w.sessionId;
        cookieHeader = w.cookieHeader;
        userAgent = w.userAgent;
      } else {
        const result = await acquire({
          source: "idealista",
          policy: opts.policy,
          headless,
          brightDataUrl: opts.brightDataUrl,
          brightDataConnectTimeoutMs,
          captchaSolveEnabled: opts.captchaSolveEnabled ?? true,
          captchaDetectTimeoutMs: opts.captchaDetectTimeoutMs ?? 20_000,
        });
        if (result.status !== "ready") {
          throw new FetcherError(
            "INTERNAL",
            `warm session unavailable: ${result.reason}`,
            "idealista-residential",
          );
        }
        warmSessionId = result.session.id;
        cookieHeader = result.session.cookieHeader;
        userAgent = result.session.userAgent;
      }

      // 2) Override de browser para tests.
      if (opts.__launchOverride) {
        try {
          const overridden = await opts.__launchOverride(pageUrl, { cookieHeader, userAgent });
          await repo.incrementWarmSessionUsage(warmSessionId).catch(() => undefined);
          return {
            html: overridden.html,
            httpStatus: overridden.httpStatus,
            strategy: "idealista-residential",
            elapsedMs: Date.now() - startedAt,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await invalidate(opts, repo, warmSessionId, message);
          throw new FetcherError("NETWORK", message, "idealista-residential");
        }
      }

      // 3) Browser real con proxy residencial + cookies warm.
      const cookieUrl = homeUrlForWarmSession("idealista");
      const kit = await createScrapingBrowserKit({
        source: "idealista",
        headless,
        // Importante: NO pasamos brightDataUrl aqui — eso forzaria CDP, y
        // contra URL de listado DataDome rechaza CDP. Queremos local +
        // proxy residencial + cookies warm.
        brightDataResidentialProxyUrl: opts.residentialProxyUrl,
        brightDataResidentialProxyUsername: opts.residentialProxyUsername,
        brightDataResidentialProxyPassword: opts.residentialProxyPassword,
        brightDataResidentialProxySession: opts.residentialProxySession,
        cookieHeader,
        cookieUrl,
        userAgent,
      });

      try {
        const response = await kit.page.goto(pageUrl, {
          waitUntil: "domcontentloaded",
          timeout: fetchOpts?.timeoutMs ?? 60_000,
        });
        const httpStatus = response?.status() ?? null;

        // Si el sitio devolvio 401/403/429 invalidamos la sesion warm.
        if (httpStatus === 401 || httpStatus === 403 || httpStatus === 429) {
          await invalidate(opts, repo, warmSessionId, `HTTP ${httpStatus} en residential`);
          throw new FetcherError(
            httpStatus === 429 ? "HTTP_ERROR" : "UNAUTHORIZED",
            `Idealista devolvio HTTP ${httpStatus} via proxy residencial`,
            "idealista-residential",
            httpStatus,
          );
        }

        await kit.page
          .waitForLoadState("networkidle", { timeout: networkIdleTimeoutMs })
          .catch(() => undefined);

        const html = await kit.page.content();
        await repo.incrementWarmSessionUsage(warmSessionId).catch(() => undefined);

        return {
          html,
          httpStatus,
          strategy: "idealista-residential",
          elapsedMs: Date.now() - startedAt,
        };
      } catch (err) {
        if (err instanceof FetcherError) throw err;
        const message = err instanceof Error ? err.message : String(err);
        await invalidate(opts, repo, warmSessionId, message);
        throw new FetcherError("NETWORK", message, "idealista-residential");
      } finally {
        await kit.browser.close().catch(() => undefined);
      }
    },

    /**
     * Variante interactiva: abre Idealista con cookies warm + proxy
     * residencial y delega en el callback `action(page, beforeHtml)` para
     * que haga click en "Ver telefono" y extraiga datos. Usado por el
     * runtime para fichas de detalle (Fase Captacion).
     */
    capture: async <T>(
      pageUrl: string,
      fetchOpts: FetcherFetchOptions,
      action: DetailCaptureAction<T>,
    ): Promise<DetailCaptureFetcherResult<T>> => {
      const startedAt = Date.now();

      // 1) Warm session (cookies + UA).
      let warmSessionId: string;
      let cookieHeader: string;
      let userAgent: string;
      if (opts.__acquireOverride) {
        const w = await opts.__acquireOverride("idealista");
        warmSessionId = w.sessionId;
        cookieHeader = w.cookieHeader;
        userAgent = w.userAgent;
      } else {
        const acquired = await acquire({
          source: "idealista",
          policy: opts.policy,
          headless,
          brightDataUrl: opts.brightDataUrl,
          brightDataConnectTimeoutMs,
          captchaSolveEnabled: opts.captchaSolveEnabled ?? true,
          captchaDetectTimeoutMs: opts.captchaDetectTimeoutMs ?? 20_000,
        });
        if (acquired.status !== "ready") {
          throw new FetcherError(
            "INTERNAL",
            `warm session unavailable: ${acquired.reason}`,
            "idealista-residential",
          );
        }
        warmSessionId = acquired.session.id;
        cookieHeader = acquired.session.cookieHeader;
        userAgent = acquired.session.userAgent;
      }

      const cookieUrl = homeUrlForWarmSession("idealista");
      const kit = await createScrapingBrowserKit({
        source: "idealista",
        headless,
        brightDataResidentialProxyUrl: opts.residentialProxyUrl,
        brightDataResidentialProxyUsername: opts.residentialProxyUsername,
        brightDataResidentialProxyPassword: opts.residentialProxyPassword,
        brightDataResidentialProxySession: opts.residentialProxySession,
        cookieHeader,
        cookieUrl,
        userAgent,
      });

      try {
        const response = await kit.page.goto(pageUrl, {
          waitUntil: "domcontentloaded",
          timeout: fetchOpts.timeoutMs ?? 60_000,
        });
        const httpStatus = response?.status() ?? null;

        if (httpStatus === 401 || httpStatus === 403 || httpStatus === 429) {
          await invalidate(opts, repo, warmSessionId, `HTTP ${httpStatus} en residential capture`);
          throw new FetcherError(
            httpStatus === 429 ? "HTTP_ERROR" : "UNAUTHORIZED",
            `Idealista devolvio HTTP ${httpStatus} via proxy residencial`,
            "idealista-residential",
            httpStatus,
          );
        }

        await kit.page
          .waitForLoadState("networkidle", { timeout: networkIdleTimeoutMs })
          .catch(() => undefined);

        const beforeHtml = await kit.page.content();

        const result = await action({
          page: kit.page,
          beforeHtml,
          httpStatus,
          traceId: fetchOpts.traceId,
        });

        await repo.incrementWarmSessionUsage(warmSessionId).catch(() => undefined);

        return {
          result,
          httpStatus,
          strategy: "idealista-residential",
          elapsedMs: Date.now() - startedAt,
        };
      } catch (err) {
        if (err instanceof FetcherError) throw err;
        const message = err instanceof Error ? err.message : String(err);
        await invalidate(opts, repo, warmSessionId, message);
        throw new FetcherError("NETWORK", message, "idealista-residential");
      } finally {
        await kit.browser.close().catch(() => undefined);
      }
    },
  };
}

async function invalidate(
  opts: IdealistaResidentialFetcherOptions,
  repo: WarmSessionRepo,
  sessionId: string,
  reason: string,
): Promise<void> {
  if (opts.__invalidateOverride) {
    await opts.__invalidateOverride(sessionId, reason).catch(() => undefined);
    return;
  }
  await repo.invalidateWarmSession(sessionId, reason).catch(() => undefined);
}
