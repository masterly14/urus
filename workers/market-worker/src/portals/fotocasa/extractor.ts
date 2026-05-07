/**
 * Extractor de Fotocasa.
 *
 * Toma un `Fetcher` (típicamente un chain anti-bot construido por
 * `portals/registry.ts`) y delega la captura de HTML al fetcher.
 * El extractor solo conoce parsing y paginación específicos de Fotocasa.
 *
 * Flujo por seed:
 *  1. Itera páginas mientras quede budget (`budgetMs`, `budgetRequests`)
 *     y se sigan encontrando cards nuevas.
 *  2. Por cada página: fetcher.fetchHtml(pageUrl) → parsea HTML → acumula
 *     items deduplicados por canonicalUrl.
 *  3. Si el fetcher devuelve HTML que el parser marca como bloqueado,
 *     el chain ya intentó toda su cadena: emite `kind: blocked`.
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
  parseFotocasaListingHtml,
  type ParsedFotocasaCard,
} from "./parser";
import { buildPageUrl, parseCursor } from "./pagination";

export interface FotocasaExtractorOptions {
  /** Fetcher (típicamente un chain) que descarga el HTML de cada página. */
  fetcher: Fetcher;
  /** Tope duro de páginas por run para no saturar Fotocasa. */
  maxPages?: number;
  /** Tiempo de espera entre páginas (ms). Útil para no parecer bot. */
  politeDelayMs?: number;
  /** Timeout por request al fetcher (ms). */
  perRequestTimeoutMs?: number;
}

const DEFAULT_MAX_PAGES = 10;
const DEFAULT_POLITE_DELAY_MS = 2_500;
const DEFAULT_PER_REQUEST_TIMEOUT_MS = 30_000;

/** Returns el `MarketSource` que cubre el extractor de Fotocasa. */
export const FOTOCASA_SOURCE = sourceForPortal("fotocasa");

export function createFotocasaExtractor(opts: FotocasaExtractorOptions): MarketExtractor {
  if (!opts.fetcher) {
    throw new Error("createFotocasaExtractor requiere un fetcher");
  }
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;
  const politeDelayMs = opts.politeDelayMs ?? DEFAULT_POLITE_DELAY_MS;
  const perRequestTimeoutMs = opts.perRequestTimeoutMs ?? DEFAULT_PER_REQUEST_TIMEOUT_MS;

  return {
    source: FOTOCASA_SOURCE,
    extract: async (input: MarketExtractorInput): Promise<MarketExtractorResult> =>
      runFotocasaExtraction({
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

async function runFotocasaExtraction({
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
        // Chain agotado por bloqueo persistente.
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
      // El chain devolvió un HTML que pasó sus filtros pero el parser
      // de Fotocasa lo marca como bloqueado. Emitimos blocked para que
      // el runtime abra el circuit breaker.
      return {
        kind: "blocked",
        reason: block.reason ?? "blocked",
        pagesScanned,
      };
    }

    const { cards } = parseFotocasaListingHtml(html);
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

    if (politeDelayMs > 0) {
      await sleep(politeDelayMs);
    }
  }

  return {
    kind: "ok",
    items: allItems,
    pagesScanned,
    cursorOut: pagesScanned >= maxPages ? String(currentPage) : null,
  };
}

function filterNewCards(
  cards: ParsedFotocasaCard[],
  seenUrls: Set<string>,
): ParsedFotocasaCard[] {
  const out: ParsedFotocasaCard[] = [];
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
    const segments = url.pathname.split("/").filter(Boolean);
    const idx = segments.findIndex((s) => s === "vivienda" || s === "viviendas" || s === "pisos");
    if (idx >= 0 && segments[idx + 1]) {
      return segments[idx + 1].replace(/-capital$/, "").replace(/-/g, " ").trim();
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

// Re-export para tests externos.
export const __internal = { runFotocasaExtraction };
