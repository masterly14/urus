import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createIdealistaExtractor } from "../extractor";
import type { Fetcher, FetcherResult } from "../../../fetchers";
import { ChainExhausted } from "../../../fetchers";
import type { MarketExtractorInput } from "../../../../../../lib/workers/market-worker/extractor";

const SEED_URL = "https://www.idealista.com/venta-viviendas/cordoba-cordoba/con-pisos/";

function loadFixture(name: string): string {
  return readFileSync(join(__dirname, "fixtures", name), "utf-8");
}

function makeInput(overrides: Partial<MarketExtractorInput> = {}): MarketExtractorInput {
  return {
    source: "source_d",
    operation: "sale",
    url: SEED_URL,
    cursor: null,
    budgetMs: 60_000,
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

describe("createIdealistaExtractor", () => {
  it("falla en construccion si no se pasa fetcher", () => {
    expect(() =>
      // @ts-expect-error testando guard runtime
      createIdealistaExtractor({}),
    ).toThrow();
  });

  it("captura items de la primera pagina (HTML real, ~30 cards)", async () => {
    const html = loadFixture("listing-cordoba-pisos.html");
    const fetchSpy = vi.fn(async () => ok(html));
    const extractor = createIdealistaExtractor({
      fetcher: makeFetcher(fetchSpy),
      maxPages: 1,
      politeDelayMs: 0,
    });

    const result = await extractor.extract(makeInput());
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.items.length).toBeGreaterThanOrEqual(25);
    expect(result.items.length).toBeLessThanOrEqual(40);
    expect(result.pagesScanned).toBe(1);
    expect(result.cursorOut).toBe("2");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("dedupe entre paginas: la pagina 1 servida dos veces no anade items nuevos", async () => {
    const html = loadFixture("listing-cordoba-pisos.html");
    const fetchSpy = vi.fn(async () => ok(html));
    const extractor = createIdealistaExtractor({
      fetcher: makeFetcher(fetchSpy),
      maxPages: 5,
      politeDelayMs: 0,
    });

    const result = await extractor.extract(makeInput());
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    // En la 2da llamada el extractor ve las mismas cards que la 1ra y termina
    // (no anade nada nuevo). Si entrara una 3ra request seria un bug.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("pasa de pagina 1 a pagina 3 con HTML real distinto", async () => {
    const p1 = loadFixture("listing-cordoba-pisos.html");
    const p3 = loadFixture("listing-cordoba-pagina-3.html");
    let calls = 0;
    const fetcher = makeFetcher(async () => {
      calls++;
      // Devolvemos p1 en la 1ra llamada, p3 en la 2da, p3 en la 3ra (sin nuevas cards).
      if (calls === 1) return ok(p1);
      return ok(p3);
    });
    const extractor = createIdealistaExtractor({
      fetcher,
      maxPages: 5,
      politeDelayMs: 0,
    });

    const result = await extractor.extract(makeInput());
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    // Combinacion de p1 (~30) + cards exclusivas de p3 (no en p1).
    expect(result.items.length).toBeGreaterThan(30);
    expect(result.pagesScanned).toBe(3);
  });

  it("respeta budgetRequests", async () => {
    const html = loadFixture("listing-cordoba-pisos.html");
    const fetchSpy = vi.fn(async () => ok(html));
    const extractor = createIdealistaExtractor({
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

  it("devuelve blocked si el HTML del fetcher es la pagina DataDome real", async () => {
    const html = loadFixture("blocked-datadome.html");
    const fetchSpy = vi.fn(async () => ok(html));
    const extractor = createIdealistaExtractor({
      fetcher: makeFetcher(fetchSpy),
      maxPages: 5,
      politeDelayMs: 0,
    });
    const result = await extractor.extract(makeInput());
    expect(result.kind).toBe("blocked");
    if (result.kind !== "blocked") return;
    expect(result.reason).toMatch(/DataDome|uso indebido|HTML/i);
  });

  it("devuelve blocked cuando el chain del fetcher lanza ChainExhausted", async () => {
    const fetcher: Fetcher = {
      name: "broken",
      fetchHtml: async () => {
        throw new ChainExhausted([
          { strategy: "web-unlocker", blocked: true, reason: "datadome" },
          { strategy: "residential-proxy", blocked: true, reason: "still blocked" },
        ]);
      },
    };
    const extractor = createIdealistaExtractor({
      fetcher,
      maxPages: 5,
      politeDelayMs: 0,
    });
    const result = await extractor.extract(makeInput());
    expect(result.kind).toBe("blocked");
    if (result.kind !== "blocked") return;
    expect(result.reason).toContain("chain exhausted");
    expect(result.reason).toContain("web-unlocker");
    expect(result.reason).toContain("residential-proxy");
  });

  it("devuelve error si fetcher lanza error generico en primera pagina", async () => {
    const fetcher: Fetcher = {
      name: "broken",
      fetchHtml: async () => {
        throw new Error("network down");
      },
    };
    const extractor = createIdealistaExtractor({
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

  it("respeta cursor inicial > 1 (reanudacion via /pagina-N.htm)", async () => {
    const html = loadFixture("listing-cordoba-pisos.html");
    const fetchSpy = vi.fn(async () => ok(html));
    const extractor = createIdealistaExtractor({
      fetcher: makeFetcher(fetchSpy),
      maxPages: 1,
      politeDelayMs: 0,
    });
    await extractor.extract(makeInput({ cursor: "4" }));
    const url = fetchSpy.mock.calls[0]?.[0] as string;
    expect(url).toContain("/pagina-4.htm");
  });

  it("propaga traceId y timeout al fetcher", async () => {
    const html = loadFixture("listing-cordoba-pisos.html");
    const captured: Array<{ url: string; opts: unknown }> = [];
    const fetcher: Fetcher = {
      name: "spy",
      fetchHtml: async (url, opts) => {
        captured.push({ url, opts });
        return ok(html);
      },
    };
    const extractor = createIdealistaExtractor({
      fetcher,
      maxPages: 1,
      politeDelayMs: 0,
      perRequestTimeoutMs: 45_000,
    });
    await extractor.extract(makeInput({ traceId: "trc-id" }));
    expect(captured[0]?.opts).toMatchObject({ timeoutMs: 45_000, traceId: "trc-id" });
  });

  it("infiere city='cordoba' de la URL semilla", async () => {
    const html = loadFixture("listing-cordoba-pisos.html");
    const extractor = createIdealistaExtractor({
      fetcher: makeFetcher(async () => ok(html)),
      maxPages: 1,
      politeDelayMs: 0,
    });
    const result = await extractor.extract(makeInput());
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.items.length).toBeGreaterThan(0);
    for (const item of result.items.slice(0, 3)) {
      expect(item.payload.cityRaw).toBe("cordoba");
      expect(item.payload.operationRaw).toBe("venta");
    }
  });
});
