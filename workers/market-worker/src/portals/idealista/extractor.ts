/**
 * Extractor de Idealista (`source_d`).
 *
 * Mismo patron que Fotocasa y Pisos.com: recibe un `Fetcher` (tipicamente un
 * chain `webUnlocker -> residentialProxy + warm-cookies`) y delega la
 * captura de HTML. El extractor solo conoce parsing, paginacion y
 * deteccion de bloqueo especificos de Idealista.
 *
 * Decisiones de diseno (decisiones.md §11):
 *  - Solo listado (sin fichas de detalle en V1).
 *  - Cada pagina de listado tiene 30 cards (verificado captura real).
 *  - Maximo 5 paginas/seed por run para acotar coste Bright Data.
 *  - Politeness mas alto que Fotocasa (DataDome es mas estricto).
 */

import type {
  MarketExtractor,
  MarketExtractorInput,
  MarketExtractorItem,
  MarketExtractorResult,
} from "../../../../../lib/workers/market-worker/extractor";
import { sourceForPortal } from "../../../../../lib/market/source-mapping";
import { ChainExhausted, type Fetcher } from "../../fetchers";
import {
  cardsToExtractorItems,
  detectBlockedPage,
  parseIdealistaListingHtml,
  type ParsedIdealistaCard,
} from "./parser";
import { buildPageUrl, parseCursor } from "./pagination";

export interface IdealistaExtractorOptions {
  fetcher: Fetcher;
  /** Tope duro de paginas por run. Default 5 (decisiones.md §11.2). */
  maxPages?: number;
  /** Pausa entre paginas (ms). Default 4s para no saturar Web Unlocker. */
  politeDelayMs?: number;
  perRequestTimeoutMs?: number;
}

const DEFAULT_MAX_PAGES = 5;
const DEFAULT_POLITE_DELAY_MS = 4_000;
const DEFAULT_PER_REQUEST_TIMEOUT_MS = 60_000;

export const IDEALISTA_SOURCE = sourceForPortal("idealista");

export function createIdealistaExtractor(opts: IdealistaExtractorOptions): MarketExtractor {
  if (!opts.fetcher) {
    throw new Error("createIdealistaExtractor requiere un fetcher");
  }
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;
  const politeDelayMs = opts.politeDelayMs ?? DEFAULT_POLITE_DELAY_MS;
  const perRequestTimeoutMs = opts.perRequestTimeoutMs ?? DEFAULT_PER_REQUEST_TIMEOUT_MS;

  return {
    source: IDEALISTA_SOURCE,
    extract: async (input: MarketExtractorInput): Promise<MarketExtractorResult> =>
      runIdealistaExtraction({
        input,
        fetcher: opts.fetcher,
        maxPages,
        politeDelayMs,
        perRequestTimeoutMs,
      }),
  };
}

interface RunArgs {
  input: MarketExtractorInput;
  fetcher: Fetcher;
  maxPages: number;
  politeDelayMs: number;
  perRequestTimeoutMs: number;
}

async function runIdealistaExtraction({
  input,
  fetcher,
  maxPages,
  politeDelayMs,
  perRequestTimeoutMs,
}: RunArgs): Promise<MarketExtractorResult> {
  const startedAt = Date.now();
  const cityFromSeed = inferCityFromSeedUrl(input.url);

  const startPage = parseCursor(input.cursor);
  let currentPage = startPage;
  let pagesScanned = 0;
  let requestsConsumed = 0;
  const allItems: MarketExtractorItem[] = [];
  const seenUrls = new Set<string>();

  while (true) {
    if (pagesScanned >= maxPages) break;
    if (requestsConsumed >= input.budgetRequests) break;
    if (Date.now() - startedAt >= input.budgetMs) break;

    const pageUrl = buildPageUrl(input.url, currentPage);

    let html = "";
    let httpStatus: number | null = null;
    try {
      const fetched = await fetcher.fetchHtml(pageUrl, {
        timeoutMs: perRequestTimeoutMs,
        traceId: input.traceId,
      });
      html = fetched.html;
      httpStatus = fetched.httpStatus;
    } catch (err) {
      if (err instanceof ChainExhausted) {
        if (allItems.length > 0) {
          return {
            kind: "ok",
            items: allItems,
            pagesScanned,
            cursorOut: String(currentPage),
          };
        }
        return {
          kind: "blocked",
          reason: `chain exhausted: ${summarizeChainError(err)}`,
          pagesScanned,
        };
      }
      const message = err instanceof Error ? err.message : String(err);
      if (allItems.length > 0) {
        return {
          kind: "ok",
          items: allItems,
          pagesScanned,
          cursorOut: String(currentPage),
        };
      }
      return {
        kind: "error",
        errorCode: "FETCH_ERROR",
        errorReason: message,
        pagesScanned,
      };
    }
    requestsConsumed++;

    const block = detectBlockedPage(html);
    if (block.blocked) {
      return {
        kind: "blocked",
        reason: block.reason ?? "blocked",
        pagesScanned,
      };
    }

    const { cards } = parseIdealistaListingHtml(html);
    const newCards = filterNewCards(cards, seenUrls);
    if (newCards.length === 0) {
      pagesScanned++;
      break;
    }

    const items = cardsToExtractorItems(newCards, {
      cityFromSeed,
      defaultZone: null,
      httpStatus,
    });
    allItems.push(...items);
    pagesScanned++;
    currentPage++;

    if (politeDelayMs > 0) await sleep(politeDelayMs);
  }

  return {
    kind: "ok",
    items: allItems,
    pagesScanned,
    cursorOut: pagesScanned >= maxPages ? String(currentPage) : null,
  };
}

function filterNewCards(
  cards: ParsedIdealistaCard[],
  seenUrls: Set<string>,
): ParsedIdealistaCard[] {
  const out: ParsedIdealistaCard[] = [];
  for (const card of cards) {
    if (seenUrls.has(card.canonicalUrl)) continue;
    seenUrls.add(card.canonicalUrl);
    out.push(card);
  }
  return out;
}

function inferCityFromSeedUrl(seedUrl: string): string {
  try {
    const url = new URL(seedUrl);
    // /venta-viviendas/<ciudad>-<provincia>/...
    const segments = url.pathname.split("/").filter(Boolean);
    const idx = segments.findIndex((s) => s === "venta-viviendas" || s === "alquiler-viviendas");
    if (idx >= 0 && segments[idx + 1]) {
      const slug = segments[idx + 1];
      // Patron: <ciudad>-<provincia> (cordoba-cordoba, sevilla-sevilla, ...)
      // Cuando ciudad === provincia ("cordoba-cordoba"), nos quedamos con el primero.
      const dashIdx = slug.indexOf("-");
      const city = dashIdx >= 0 ? slug.slice(0, dashIdx) : slug;
      return city.replace(/-/g, " ").trim();
    }
    return "";
  } catch {
    return "";
  }
}

function summarizeChainError(err: ChainExhausted): string {
  return err.chainAttempts
    .map((a) => `${a.strategy}(${a.error ?? a.reason ?? "?"})`)
    .join(" → ");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const __internal = { runIdealistaExtraction };
