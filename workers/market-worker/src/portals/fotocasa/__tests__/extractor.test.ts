import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createFotocasaExtractor } from "../extractor";
import type { Fetcher, FetcherResult } from "../../../fetchers";
import { ChainExhausted } from "../../../fetchers";
import type { MarketExtractorInput } from "../../../../../../lib/workers/market-worker/extractor";

const SEED_URL =
  "https://www.fotocasa.es/es/comprar/vivienda/cordoba-capital/todas-las-zonas/l";

function loadFixture(name: string): string {
  return readFileSync(join(__dirname, "fixtures", name), "utf-8");
}

function makeInput(overrides: Partial<MarketExtractorInput> = {}): MarketExtractorInput {
  return {
    source: "source_a",
    operation: "sale",
    url: SEED_URL,
    cursor: null,
    budgetMs: 30_000,
    budgetRequests: 10,
    traceId: "trace-1",
    ...overrides,
  };
}

function makeFetcher(behaviour: (url: string) => Promise<FetcherResult>): Fetcher {
  return { name: "test-fetcher", fetchHtml: async (url) => behaviour(url) };
}

function ok(html: string): FetcherResult {
  return { html, httpStatus: 200, strategy: "test-fetcher", elapsedMs: 1 };
}

describe("createFotocasaExtractor", () => {
  it("falla en construcción si no se pasa fetcher", () => {
    expect(() =>
      // @ts-expect-error testando guard runtime
      createFotocasaExtractor({}),
    ).toThrow();
  });

  it("captura items de la primera página y dedupa", async () => {
    const html = loadFixture("listing-cordoba.html");
    const fetchSpy = vi.fn(async () => ok(html));
    const extractor = createFotocasaExtractor({
      fetcher: makeFetcher(fetchSpy),
      maxPages: 1,
      politeDelayMs: 0,
    });

    const result = await extractor.extract(makeInput());
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.items.length).toBe(3);
    expect(result.pagesScanned).toBe(1);
    expect(result.cursorOut).toBe("2");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("pagina hasta agotar contenido nuevo", async () => {
    const html = loadFixture("listing-cordoba.html");
    const fetchSpy = vi.fn(async () => ok(html));
    const extractor = createFotocasaExtractor({
      fetcher: makeFetcher(fetchSpy),
      maxPages: 5,
      politeDelayMs: 0,
    });

    const result = await extractor.extract(makeInput());
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.items.length).toBe(3);
    expect(result.pagesScanned).toBe(2);
    expect(result.cursorOut).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("respeta budgetRequests", async () => {
    const html = loadFixture("listing-cordoba.html");
    const fetchSpy = vi.fn(async () => ok(html));
    const extractor = createFotocasaExtractor({
      fetcher: makeFetcher(fetchSpy),
      maxPages: 100,
      politeDelayMs: 0,
    });

    const result = await extractor.extract(makeInput({ budgetRequests: 1 }));
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.pagesScanned).toBe(1);
  });

  it("devuelve blocked si el parser detecta bloqueo en HTML del fetcher", async () => {
    const html = loadFixture("blocked-captcha.html");
    const fetchSpy = vi.fn(async () => ok(html));
    const extractor = createFotocasaExtractor({
      fetcher: makeFetcher(fetchSpy),
      maxPages: 5,
      politeDelayMs: 0,
    });
    const result = await extractor.extract(makeInput());
    expect(result.kind).toBe("blocked");
    if (result.kind !== "blocked") return;
    // El parser nuevo describe el bloqueo en español; aceptamos cualquier
    // descripción que mencione bloqueo, captcha, robot o anti-bot.
    expect(result.reason).toMatch(/bloqueo|blocked|captcha|robot|verificaci/i);
  });

  it("devuelve blocked cuando el chain del fetcher lanza ChainExhausted", async () => {
    const fetcher: Fetcher = {
      name: "broken",
      fetchHtml: async () => {
        throw new ChainExhausted([
          { strategy: "direct-browser", blocked: true, reason: "captcha" },
          { strategy: "web-unlocker", blocked: true, reason: "still blocked" },
        ]);
      },
    };
    const extractor = createFotocasaExtractor({
      fetcher,
      maxPages: 5,
      politeDelayMs: 0,
    });
    const result = await extractor.extract(makeInput());
    expect(result.kind).toBe("blocked");
    if (result.kind !== "blocked") return;
    expect(result.reason).toContain("chain exhausted");
    expect(result.reason).toContain("direct-browser");
    expect(result.reason).toContain("web-unlocker");
  });

  it("devuelve error si fetcher lanza error genérico en primera página", async () => {
    const fetcher: Fetcher = {
      name: "broken",
      fetchHtml: async () => {
        throw new Error("network down");
      },
    };
    const extractor = createFotocasaExtractor({
      fetcher,
      maxPages: 5,
      politeDelayMs: 0,
    });
    const result = await extractor.extract(makeInput());
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.errorCode).toBe("FETCH_ERROR");
    expect(result.errorReason).toContain("network down");
  });

  it("respeta cursor inicial > 1 (reanudación)", async () => {
    const html = loadFixture("listing-cordoba.html");
    const fetchSpy = vi.fn(async () => ok(html));
    const extractor = createFotocasaExtractor({
      fetcher: makeFetcher(fetchSpy),
      maxPages: 1,
      politeDelayMs: 0,
    });
    await extractor.extract(makeInput({ cursor: "5" }));
    const url = fetchSpy.mock.calls[0]?.[0] as string;
    expect(url).toContain("pagina=5");
  });

  it("propaga traceId y timeout al fetcher", async () => {
    const html = loadFixture("listing-cordoba.html");
    const captured: Array<{ url: string; opts: unknown }> = [];
    const fetcher: Fetcher = {
      name: "spy",
      fetchHtml: async (url, opts) => {
        captured.push({ url, opts });
        return ok(html);
      },
    };
    const extractor = createFotocasaExtractor({
      fetcher,
      maxPages: 1,
      politeDelayMs: 0,
      perRequestTimeoutMs: 12_345,
    });
    await extractor.extract(makeInput({ traceId: "trc-fc" }));
    expect(captured[0]?.opts).toMatchObject({ timeoutMs: 12_345, traceId: "trc-fc" });
  });

  it("captura los 31 anuncios del listing real (modo SSR via __INITIAL_PROPS__)", async () => {
    const html = loadFixture("listing-cordoba-real.html");
    const fetchSpy = vi.fn(async () => ok(html));
    const extractor = createFotocasaExtractor({
      fetcher: makeFetcher(fetchSpy),
      maxPages: 1,
      politeDelayMs: 0,
    });

    const result = await extractor.extract(makeInput());
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.items.length).toBe(31);
    expect(result.pagesScanned).toBe(1);
    // Cada item debe traer payload enriquecido (descripción, teléfono, fotos).
    const conPhone = result.items.filter((it) => Array.isArray(it.payload.phones) && it.payload.phones!.length > 0);
    expect(conPhone.length).toBeGreaterThan(0);
    const conImages = result.items.filter((it) => Array.isArray(it.payload.imageUrls) && it.payload.imageUrls!.length > 0);
    expect(conImages.length).toBe(31);
  });
});
