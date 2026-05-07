/**
 * Chain anti-bot de Idealista (decisiones.md §11.3).
 *
 *   webUnlocker (zone web_unlocker_market, premium domain ON,
 *                custom-headers/cookies OFF, country=es)
 *     └─ on block (HTTP 401/403/429 o body con uso indebido / datadome captcha)
 *        residentialProxy + warm-session-cookies
 *          └─ on block
 *             chain agotada => extractor recibe ChainExhausted
 *                              y devuelve `kind: blocked`.
 *
 * El detector de bloqueo del chain confia en:
 *  1. La pista `blocked`/`blockedReason` que devuelve el fetcher
 *     `web-unlocker` (mira HTTP final + cuerpo). Si esta marcada, fallback.
 *  2. El parser del extractor de Idealista, que tras el chain corre
 *     `detectBlockedPage(html)` para casos sutiles.
 */

import {
  ChainExhausted,
  createChainedFetcher,
  type ChainBlockDecision,
  type ChainFallbackEvent,
  type Fetcher,
  type FetcherResult,
} from "./index";
import {
  createWebUnlockerFetcher,
  type WebUnlockerFetcherOptions,
  type WebUnlockerFetcherResult,
} from "./web-unlocker";
import {
  createIdealistaResidentialFetcher,
  type IdealistaResidentialFetcherOptions,
} from "./idealista-residential";

export interface IdealistaChainOptions {
  /** Configuracion del fetcher Web Unlocker (primary). */
  webUnlocker: WebUnlockerFetcherOptions;
  /** Configuracion del fetcher residencial + warm cookies (fallback). */
  residential: IdealistaResidentialFetcherOptions;
  /** Hook opcional para logs estructurados / metricas. */
  onFallback?: (info: ChainFallbackEvent) => void;
}

/**
 * Detector de bloqueo a nivel de chain. Mira el flag `blocked` que el
 * `WebUnlockerFetcher` propaga (basado en `unlockUrl` que clasifica
 * HTTP 401/403/429 y el body DataDome). Asi la chain puede caer al
 * fallback sin parsear el HTML completo.
 *
 * Si el resultado viene de un fetcher que no expone `blocked` (residencial
 * o tests), no marcamos como bloqueado aqui — dejamos que el extractor
 * lo detecte via `detectBlockedPage(html)`.
 */
function isBlocked(result: FetcherResult): ChainBlockDecision {
  const maybe = result as WebUnlockerFetcherResult;
  if (maybe.blocked) {
    return { blocked: true, reason: `web-unlocker:${maybe.blockedReason ?? "unknown"}` };
  }
  return { blocked: false };
}

/**
 * Construye la chain de Idealista. La primera estrategia es Web Unlocker
 * (REST, premium); la segunda residencial + warm cookies.
 *
 * Para `capture()` (interaccion + click) saltamos directo al residencial
 * porque el web-unlocker REST no expone una `Page` Playwright.
 */
export function createIdealistaChain(opts: IdealistaChainOptions): Fetcher {
  const webUnlocker = createWebUnlockerFetcher(opts.webUnlocker);
  const residential = createIdealistaResidentialFetcher(opts.residential);

  const chain = createChainedFetcher({
    name: "idealista-chain",
    fetchers: [webUnlocker, residential],
    isBlocked,
    onFallback: opts.onFallback,
  });

  return {
    name: chain.name,
    fetchHtml: chain.fetchHtml,
    capture: residential.capture
      ? residential.capture.bind(residential)
      : undefined,
  };
}

export { ChainExhausted };
