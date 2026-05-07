/**
 * Fetcher de estrategia "web-unlocker": Bright Data Web Unlocker API.
 *
 * Sin navegador: hace una petición HTTP autenticada al endpoint de
 * Bright Data, que internamente resuelve captchas/anti-bot y devuelve
 * el HTML real de la URL solicitada. Mucho más barato y rápido que
 * arrancar Chromium, pero sólo expone HTML estático (no ejecuta JS
 * adicional tras carga inicial).
 *
 * Reutiliza `lib/scraping/web-unlocker/client.ts` (ya probado en el
 * pipeline Statefox de imágenes) para no duplicar el cliente HTTP.
 */

import {
  unlockUrl,
  type UnlockBlockedReason,
} from "../../../../lib/scraping/web-unlocker/client";
import { FetcherError, type Fetcher, type FetcherResult } from "./types";

/**
 * Result extendido con la pista de bloqueo del sitio destino. La chain de
 * fetchers la inspecciona via `isBlocked` para caer al fallback (residencial)
 * sin tener que parsear el HTML.
 */
export interface WebUnlockerFetcherResult extends FetcherResult {
  blocked?: boolean;
  blockedReason?: UnlockBlockedReason;
}

export interface WebUnlockerFetcherOptions {
  /** Token API de Bright Data (obligatorio). */
  apiToken: string;
  /** Zona del proyecto Bright Data (p. ej. "datacenter_unlock"). Obligatorio. */
  zone: string;
  /** País preferido para el request (ISO-2 minúsculas, ej. "es"). */
  country?: string;
  /** Base URL del API. Default: `https://api.brightdata.com`. */
  baseUrl?: string;
  /** Timeout HTTP por request (ms). Default: 60s. */
  timeoutMs?: number;
  /** Inyectable para tests sin hacer red real. */
  fetchImpl?: typeof fetch;
  /**
   * Headers extra (per-request) que el Web Unlocker traduce en overrides
   * de comportamiento. El caso típico es reutilizar una zona configurada
   * con `expect_element` para un portal (Idealista) en otro portal (Fotocasa)
   * pasando `{ "x-unblock-expect": '{"element":"body"}' }` para que la API
   * no espere el selector de Idealista. Requiere que la zona tenga
   * activado "Manual 'expect' elements" en el dashboard.
   */
  extraHeaders?: Record<string, string>;
}

export function createWebUnlockerFetcher(opts: WebUnlockerFetcherOptions): Fetcher {
  if (!opts.apiToken) {
    throw new FetcherError(
      "MISCONFIGURED",
      "createWebUnlockerFetcher requiere apiToken",
      "web-unlocker",
    );
  }
  if (!opts.zone) {
    throw new FetcherError(
      "MISCONFIGURED",
      "createWebUnlockerFetcher requiere zone",
      "web-unlocker",
    );
  }

  return {
    name: "web-unlocker",
    fetchHtml: async (pageUrl: string, fetchOpts): Promise<WebUnlockerFetcherResult> => {
      const startedAt = Date.now();
      const outcome = await unlockUrl({
        url: pageUrl,
        zone: opts.zone,
        apiToken: opts.apiToken,
        baseUrl: opts.baseUrl,
        country: opts.country,
        timeoutMs: fetchOpts?.timeoutMs ?? opts.timeoutMs,
        fetchImpl: opts.fetchImpl,
        format: "raw",
        extraHeaders: opts.extraHeaders,
      });

      if (!outcome.ok) {
        const code = outcome.status === 401 || outcome.status === 403 ? "UNAUTHORIZED" : "HTTP_ERROR";
        throw new FetcherError(
          code,
          outcome.errorMessage,
          "web-unlocker",
          outcome.status,
        );
      }

      return {
        html: outcome.html,
        httpStatus: outcome.status,
        strategy: "web-unlocker",
        elapsedMs: Date.now() - startedAt,
        blocked: outcome.blocked,
        blockedReason: outcome.blockedReason,
      };
    },
  };
}
