/**
 * Extractor de Pisos.com.
 *
 * Mismo patrón que Fotocasa: recibe un `Fetcher` (chain anti-bot
 * configurado en `portals/registry.ts`) y delega la captura de HTML.
 * Pisos.com es laxo en V1 (decisiones §2.2: empezar con `directBrowser`,
 * escalar a `webUnlocker` si se detectan bloqueos).
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
  parsePisoscomListingHtml,
  type ParsedPisoscomCard,
} from "./parser";
import { buildPageUrl, parseCursor } from "./pagination";

export interface PisoscomExtractorOptions {
  fetcher: Fetcher;
  maxPages?: number;
  politeDelayMs?: number;
  perRequestTimeoutMs?: number;
}

const DEFAULT_MAX_PAGES = 10;
const DEFAULT_POLITE_DELAY_MS = 2_500;
const DEFAULT_PER_REQUEST_TIMEOUT_MS = 30_000;

export const PISOSCOM_SOURCE = sourceForPortal("pisoscom");

export function createPisoscomExtractor(
  opts: PisoscomExtractorOptions,
): MarketExtractor {
  if (!opts.fetcher) {
    throw new Error("createPisoscomExtractor requiere un fetcher");
  }
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;
  const politeDelayMs = opts.politeDelayMs ?? DEFAULT_POLITE_DELAY_MS;
  const perRequestTimeoutMs =
    opts.perRequestTimeoutMs ?? DEFAULT_PER_REQUEST_TIMEOUT_MS;

  return {
    source: PISOSCOM_SOURCE,
    extract: async (input: MarketExtractorInput): Promise<MarketExtractorResult> =>
      runPisoscomExtraction({
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

async function runPisoscomExtraction({
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

    const { cards } = parsePisoscomListingHtml(html);
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
  cards: ParsedPisoscomCard[],
  seenUrls: Set<string>,
): ParsedPisoscomCard[] {
  const out: ParsedPisoscomCard[] = [];
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
    // /comprar/{housing}-{ciudad}/...
    const slug = segments[1] ?? "";
    const dashIdx = slug.indexOf("-");
    if (dashIdx >= 0) return slug.slice(dashIdx + 1).replace(/-/g, " ").trim();
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

export const __internal = { runPisoscomExtraction };
