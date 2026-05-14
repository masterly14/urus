import { describe, expect, it, vi } from "vitest";
import type { MarketCrawlRun, Prisma } from "@prisma/client";
import { MarketWorkerRuntime } from "../runtime";
import type {
  MarketExtractor,
  MarketExtractorInput,
  MarketExtractorItem,
  MarketExtractorResult,
} from "../extractor";

// ---------------------------------------------------------------------------
// Mock minimal de Prisma. Solo implementa los métodos que el runtime usa.
// ---------------------------------------------------------------------------

interface FakeRawListingRow {
  source: string;
  contentHash: string;
  canonicalUrl: string;
  externalId: string | null;
  crawlRunId: string;
  payload: unknown;
  status: string;
  capturedAt: Date;
  httpStatus: number | null;
}

interface FakeBreakerRow {
  source: string;
  status: string;
  failureCount: number;
  openedAt: Date;
  updatedAt: Date;
}

function buildFakePrisma() {
  const runs = new Map<string, MarketCrawlRun>();
  const rawListings = new Map<string, FakeRawListingRow>(); // key = source|contentHash
  const breakers = new Map<string, FakeBreakerRow>();

  const seedRun = (overrides: Partial<MarketCrawlRun> = {}): MarketCrawlRun => {
    const run: MarketCrawlRun = {
      id: overrides.id ?? "run-1",
      seedId: overrides.seedId ?? "seed-1",
      source: (overrides.source ?? "source_a") as MarketCrawlRun["source"],
      status: (overrides.status ?? "RUNNING") as MarketCrawlRun["status"],
      startedAt: overrides.startedAt ?? new Date("2026-05-06T10:00:00Z"),
      finishedAt: overrides.finishedAt ?? null,
      pagesScanned: overrides.pagesScanned ?? 0,
      itemsCaptured: overrides.itemsCaptured ?? 0,
      itemsRejected: overrides.itemsRejected ?? 0,
      blockedCount: overrides.blockedCount ?? 0,
      errorCode: overrides.errorCode ?? null,
      errorMessage: overrides.errorMessage ?? null,
      budgetMs: overrides.budgetMs ?? 60000,
      budgetRequests: overrides.budgetRequests ?? 50,
      cursorIn: overrides.cursorIn ?? null,
      cursorOut: overrides.cursorOut ?? null,
      correlationId: overrides.correlationId ?? "corr-1",
    };
    runs.set(run.id, run);
    return run;
  };

  const prisma = {
    marketCrawlRun: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return runs.get(where.id) ?? null;
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<MarketCrawlRun> & {
            blockedCount?: { increment: number };
          };
        }) => {
          const existing = runs.get(where.id);
          if (!existing) throw new Error(`run ${where.id} no existe`);
          const next: MarketCrawlRun = {
            ...existing,
            ...data,
            blockedCount:
              (data as { blockedCount?: { increment: number } }).blockedCount &&
              typeof (data as { blockedCount?: { increment: number } })
                .blockedCount === "object"
                ? existing.blockedCount + ((data as { blockedCount?: { increment: number } }).blockedCount?.increment ?? 0)
                : existing.blockedCount,
          };
          runs.set(where.id, next);
          return next;
        },
      ),
    },
    marketRawListing: {
      upsert: vi.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: {
            source_contentHash: { source: string; contentHash: string };
          };
          create: FakeRawListingRow;
          update: Partial<FakeRawListingRow>;
        }) => {
          const key = `${where.source_contentHash.source}|${where.source_contentHash.contentHash}`;
          if (rawListings.has(key)) {
            const existing = rawListings.get(key)!;
            const merged = { ...existing, ...update };
            rawListings.set(key, merged);
            return merged;
          }
          rawListings.set(key, create);
          return create;
        },
      ),
    },
    marketCircuitBreaker: {
      upsert: vi.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { source: string };
          create: FakeBreakerRow;
          update: Partial<FakeBreakerRow> & {
            failureCount?: { increment: number };
          };
        }) => {
          const existing = breakers.get(where.source);
          if (!existing) {
            breakers.set(where.source, create);
            return create;
          }
          const next: FakeBreakerRow = {
            ...existing,
            ...update,
            failureCount:
              update.failureCount && typeof update.failureCount === "object"
                ? existing.failureCount + (update.failureCount.increment ?? 0)
                : existing.failureCount,
          };
          breakers.set(where.source, next);
          return next;
        },
      ),
    },
    $transaction: vi.fn(async (arg: unknown) => arg),
  } as unknown as Parameters<typeof MarketWorkerRuntime>[0]["prisma"] & {
    __runs: typeof runs;
    __rawListings: typeof rawListings;
    __breakers: typeof breakers;
    __seedRun: typeof seedRun;
  };

  // Hooks de inspección para los tests
  (prisma as unknown as Record<string, unknown>).__runs = runs;
  (prisma as unknown as Record<string, unknown>).__rawListings = rawListings;
  (prisma as unknown as Record<string, unknown>).__breakers = breakers;
  (prisma as unknown as Record<string, unknown>).__seedRun = seedRun;

  return prisma as Parameters<typeof MarketWorkerRuntime>[0]["prisma"] & {
    __runs: Map<string, MarketCrawlRun>;
    __rawListings: Map<string, FakeRawListingRow>;
    __breakers: Map<string, FakeBreakerRow>;
    __seedRun: typeof seedRun;
  };
}

// ---------------------------------------------------------------------------
// Helpers de extractor
// ---------------------------------------------------------------------------

function makeExtractor(
  resultOrFn:
    | MarketExtractorResult
    | ((input: MarketExtractorInput) => Promise<MarketExtractorResult>),
): MarketExtractor {
  return {
    source: "source_a",
    extract: async (input) => {
      if (typeof resultOrFn === "function") return resultOrFn(input);
      return resultOrFn;
    },
  };
}

function makeItem(overrides: Partial<MarketExtractorItem> = {}): MarketExtractorItem {
  return {
    externalId: overrides.externalId ?? "ext-1",
    canonicalUrl: overrides.canonicalUrl ?? "https://portal.example.com/inmueble/ext-1",
    contentHash: overrides.contentHash ?? "hash-1",
    httpStatus: overrides.httpStatus ?? 200,
    payload: overrides.payload ?? {
      title: "Piso en Córdoba",
      priceRaw: "180.000 €",
    },
  };
}

const VALID_PAYLOAD = {
  runId: "run-1",
  seedId: "seed-1",
  source: "source_a",
  operation: "sale",
  url: "https://portal.example.com/cordoba",
  cursor: null,
  budgetMs: 60_000,
  budgetRequests: 50,
  deadlineMs: 5_000,
  traceId: "trace-1",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MarketWorkerRuntime — autorización", () => {
  it("acepta request con secret correcto", () => {
    const prisma = buildFakePrisma();
    const rt = new MarketWorkerRuntime({
      secret: "shh",
      prisma,
      extractors: new Map([["source_a", makeExtractor({ kind: "ok", items: [], pagesScanned: 0, cursorOut: null })]]),
    });
    expect(rt.isAuthorized("shh")).toBe(true);
  });

  it("rechaza request sin secret o con secret incorrecto", () => {
    const prisma = buildFakePrisma();
    const rt = new MarketWorkerRuntime({
      secret: "shh",
      prisma,
      extractors: new Map([["source_a", makeExtractor({ kind: "ok", items: [], pagesScanned: 0, cursorOut: null })]]),
    });
    expect(rt.isAuthorized(undefined)).toBe(false);
    expect(rt.isAuthorized(null)).toBe(false);
    expect(rt.isAuthorized("")).toBe(false);
    expect(rt.isAuthorized("wrong")).toBe(false);
  });
});

describe("MarketWorkerRuntime — validatePayload", () => {
  function buildRuntime() {
    const prisma = buildFakePrisma();
    return new MarketWorkerRuntime({
      secret: "shh",
      prisma,
      extractors: new Map([["source_a", makeExtractor({ kind: "ok", items: [], pagesScanned: 0, cursorOut: null })]]),
    });
  }

  it("acepta payload completo", () => {
    const rt = buildRuntime();
    const r = rt.validatePayload(VALID_PAYLOAD);
    expect(r.ok).toBe(true);
  });

  it("rechaza source no soportada por este Worker", () => {
    const rt = buildRuntime();
    const r = rt.validatePayload({ ...VALID_PAYLOAD, source: "source_b" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(422);
  });

  it("rechaza payload sin campos obligatorios", () => {
    const rt = buildRuntime();
    expect(rt.validatePayload({}).ok).toBe(false);
    expect(rt.validatePayload({ ...VALID_PAYLOAD, runId: "" }).ok).toBe(false);
    expect(rt.validatePayload({ ...VALID_PAYLOAD, url: "no-es-url" }).ok).toBe(false);
    expect(rt.validatePayload({ ...VALID_PAYLOAD, budgetMs: -1 }).ok).toBe(false);
  });
});

describe("MarketWorkerRuntime — detalle", () => {
  function buildRuntimeWithDetail(detailHtml: string) {
    const prisma = buildFakePrisma();
    return new MarketWorkerRuntime({
      secret: "shh",
      prisma,
      extractors: new Map([["source_a", makeExtractor({ kind: "ok", items: [], pagesScanned: 0, cursorOut: null })]]),
      detailFetchers: new Map([
        [
          "source_a",
          {
            name: "direct-browser",
            fetchHtml: async () => ({
              html: detailHtml,
              httpStatus: 200,
              strategy: "direct-browser",
            }),
          },
        ],
      ]),
    });
  }

  it("valida payload de detalle y exige fetcher por source", () => {
    const rt = buildRuntimeWithDetail("<html></html>");
    const ok = rt.validateDetailPayload({
      source: "source_a",
      canonicalUrl: "https://www.fotocasa.es/es/comprar/vivienda/x/d",
      traceId: "trace-1",
    });
    expect(ok.ok).toBe(true);

    const bad = rt.validateDetailPayload({
      source: "source_b",
      canonicalUrl: "https://www.pisos.com/comprar/piso-cordoba/",
      traceId: "trace-2",
    });
    expect(bad.ok).toBe(false);
  });

  it("extrae y normaliza teléfono en runCrawlDetail", async () => {
    // El parser de Fotocasa exige selectors del bloque de contacto del
    // anunciante (re-ContactDetail-phone*) o data-testid="phone" para
    // evitar capturar telefonos institucionales del footer. Emulamos
    // ese DOM y un __NEXT_DATA__ minimo que marca clientTypeId=1 (particular).
    const rt = buildRuntimeWithDetail(
      `<html><body>
        <a class="re-ContactDetail-phoneButton" href="tel:600 111 222">Llamar</a>
        <script id="__NEXT_DATA__" type="application/json">
          {"props":{"pageProps":{"initialProps":{"realEstate":{"contactInfo":{"clientTypeId":1}}}}}}
        </script>
      </body></html>`,
    );
    const payload = rt.validateDetailPayload({
      source: "source_a",
      canonicalUrl: "https://www.fotocasa.es/es/comprar/vivienda/x/d",
      traceId: "trace-3",
    });
    if (!payload.ok) throw new Error("payload inválido");

    const result = await rt.runCrawlDetail(payload.data);
    expect(result.status).toBe("completed");
    if (result.status !== "completed") return;
    expect(result.phones).toContain("+34600111222");
    expect(result.advertiserType).toBe("particular");
  });

  it("para idealista usa endpoint AJAX de phones cuando la ficha no trae número", async () => {
    const prisma = buildFakePrisma();
    const fetchHtml = vi
      .fn()
      .mockResolvedValueOnce({
        html: `
          <script>
            var cfg = {
              urlAdContactPhones: '/es/ajax/ads/{adId}/contact-phones',
              idForm: { adId: 111192450 },
              adProfessionalName: "Inmolike"
            };
          </script>
        `,
        httpStatus: 200,
        strategy: "web-unlocker",
      })
      .mockResolvedValueOnce({
        html: `{"phones":[{"formattedPhoneNumber":"600 123 456"}]}`,
        httpStatus: 200,
        strategy: "web-unlocker",
      });

    const rt = new MarketWorkerRuntime({
      secret: "shh",
      prisma,
      extractors: new Map([["source_a", makeExtractor({ kind: "ok", items: [], pagesScanned: 0, cursorOut: null })]]),
      detailFetchers: new Map([
        [
          "source_d",
          {
            name: "web-unlocker",
            fetchHtml,
          },
        ],
      ]),
    });

    const payload = rt.validateDetailPayload({
      source: "source_d",
      canonicalUrl: "https://www.idealista.com/inmueble/111192450/",
      traceId: "trace-idealista-1",
    });
    if (!payload.ok) throw new Error("payload inválido");

    const result = await rt.runCrawlDetail(payload.data);
    expect(result.status).toBe("completed");
    if (result.status !== "completed") return;
    expect(result.phones).toContain("+34600123456");
    expect(result.advertiserType).toBe("agency");
    expect(fetchHtml).toHaveBeenCalledTimes(2);
    expect(fetchHtml.mock.calls[1]?.[0]).toBe(
      "https://www.idealista.com/es/ajax/ads/111192450/contact-phones",
    );
  });
});

describe("MarketWorkerRuntime — runCrawlSeed (camino feliz)", () => {
  it("persiste items y devuelve completed", async () => {
    const prisma = buildFakePrisma();
    prisma.__seedRun({ id: "run-1" });
    const items = [makeItem({ contentHash: "h1" }), makeItem({ contentHash: "h2", externalId: "ext-2", canonicalUrl: "https://portal.example.com/inmueble/ext-2" })];
    const extractor = makeExtractor({
      kind: "ok",
      items,
      pagesScanned: 1,
      cursorOut: "page-2",
    });
    const rt = new MarketWorkerRuntime({
      secret: "shh",
      prisma,
      extractors: new Map([["source_a", extractor]]),
      defaultDeadlineMs: 5_000,
    });

    const valid = rt.validatePayload(VALID_PAYLOAD);
    expect(valid.ok).toBe(true);
    if (!valid.ok) return;

    const res = await rt.runCrawlSeed(valid.data);
    expect(res.status).toBe("completed");
    if (res.status !== "completed") return;
    expect(res.itemsCaptured).toBe(2);
    expect(res.itemsRejected).toBe(0);
    expect(res.pagesScanned).toBe(1);
    expect(res.cursorOut).toBe("page-2");

    expect(prisma.__rawListings.size).toBe(2);
    const run = prisma.__runs.get("run-1")!;
    expect(run.status).toBe("COMPLETED");
    expect(run.pagesScanned).toBe(1);
    expect(run.itemsCaptured).toBe(2);
    expect(run.cursorOut).toBe("page-2");
    expect(run.finishedAt).toBeInstanceOf(Date);
  });

  it("dedupa items con mismo contentHash dentro del run", async () => {
    const prisma = buildFakePrisma();
    prisma.__seedRun({ id: "run-1" });
    const dup = makeItem({ contentHash: "h-dup" });
    const extractor = makeExtractor({
      kind: "ok",
      items: [dup, dup, dup],
      pagesScanned: 1,
      cursorOut: null,
    });
    const rt = new MarketWorkerRuntime({
      secret: "shh",
      prisma,
      extractors: new Map([["source_a", extractor]]),
    });

    const valid = rt.validatePayload(VALID_PAYLOAD);
    if (!valid.ok) throw new Error("payload");
    const res = await rt.runCrawlSeed(valid.data);

    expect(res.status).toBe("completed");
    expect(prisma.__rawListings.size).toBe(1); // dedupe a nivel store por (source, contentHash)
  });

  it("descarta items sin canonicalUrl o sin contentHash", async () => {
    const prisma = buildFakePrisma();
    prisma.__seedRun({ id: "run-1" });
    const extractor = makeExtractor({
      kind: "ok",
      items: [
        makeItem({ contentHash: "h-ok" }),
        makeItem({ contentHash: "", canonicalUrl: "https://x" }),
        makeItem({ contentHash: "h-bad", canonicalUrl: "" }),
      ],
      pagesScanned: 1,
      cursorOut: null,
    });
    const rt = new MarketWorkerRuntime({
      secret: "shh",
      prisma,
      extractors: new Map([["source_a", extractor]]),
    });

    const valid = rt.validatePayload(VALID_PAYLOAD);
    if (!valid.ok) throw new Error("payload");
    const res = await rt.runCrawlSeed(valid.data);

    expect(res.status).toBe("completed");
    if (res.status !== "completed") return;
    expect(res.itemsCaptured).toBe(1);
    expect(res.itemsRejected).toBe(2);
  });
});

describe("MarketWorkerRuntime — caminos de error", () => {
  it("devuelve failed con RUN_NOT_FOUND si el run no existe", async () => {
    const prisma = buildFakePrisma();
    const rt = new MarketWorkerRuntime({
      secret: "shh",
      prisma,
      extractors: new Map([["source_a", makeExtractor({ kind: "ok", items: [], pagesScanned: 0, cursorOut: null })]]),
    });
    const valid = rt.validatePayload(VALID_PAYLOAD);
    if (!valid.ok) throw new Error("payload");
    const res = await rt.runCrawlSeed(valid.data);
    expect(res.status).toBe("failed");
    if (res.status !== "failed") return;
    expect(res.errorCode).toBe("RUN_NOT_FOUND");
  });

  it("devuelve blocked y abre circuit breaker cuando el extractor reporta blocked", async () => {
    const prisma = buildFakePrisma();
    prisma.__seedRun({ id: "run-1" });
    const extractor = makeExtractor({
      kind: "blocked",
      reason: "captcha",
      pagesScanned: 1,
    });
    const rt = new MarketWorkerRuntime({
      secret: "shh",
      prisma,
      extractors: new Map([["source_a", extractor]]),
    });

    const valid = rt.validatePayload(VALID_PAYLOAD);
    if (!valid.ok) throw new Error("payload");
    const res = await rt.runCrawlSeed(valid.data);
    expect(res.status).toBe("blocked");

    const run = prisma.__runs.get("run-1")!;
    expect(run.status).toBe("PARTIAL");
    expect(run.errorCode).toBe("BLOCKED");

    const breaker = prisma.__breakers.get("source_a")!;
    expect(breaker).toBeDefined();
    expect(breaker.status).toBe("OPEN");
    expect(breaker.failureCount).toBe(1);
  });

  it("devuelve failed cuando el extractor lanza", async () => {
    const prisma = buildFakePrisma();
    prisma.__seedRun({ id: "run-1" });
    const extractor: MarketExtractor = {
      source: "source_a",
      extract: async () => {
        throw new Error("network down");
      },
    };
    const rt = new MarketWorkerRuntime({
      secret: "shh",
      prisma,
      extractors: new Map([["source_a", extractor]]),
    });

    const valid = rt.validatePayload(VALID_PAYLOAD);
    if (!valid.ok) throw new Error("payload");
    const res = await rt.runCrawlSeed(valid.data);
    expect(res.status).toBe("failed");
    if (res.status !== "failed") return;
    expect(res.errorCode).toBe("EXTRACTOR_ERROR");
    expect(res.errorReason).toContain("network down");

    const run = prisma.__runs.get("run-1")!;
    expect(run.status).toBe("FAILED");
  });

  it("devuelve failed con código del extractor cuando devuelve kind=error", async () => {
    const prisma = buildFakePrisma();
    prisma.__seedRun({ id: "run-1" });
    const extractor = makeExtractor({
      kind: "error",
      errorCode: "PARSE_ERROR",
      errorReason: "selector roto",
      pagesScanned: 0,
    });
    const rt = new MarketWorkerRuntime({
      secret: "shh",
      prisma,
      extractors: new Map([["source_a", extractor]]),
    });

    const valid = rt.validatePayload(VALID_PAYLOAD);
    if (!valid.ok) throw new Error("payload");
    const res = await rt.runCrawlSeed(valid.data);
    expect(res.status).toBe("failed");
    if (res.status !== "failed") return;
    expect(res.errorCode).toBe("PARSE_ERROR");
    expect(res.errorReason).toBe("selector roto");
  });
});

describe("MarketWorkerRuntime — concurrencia y deadline", () => {
  it("devuelve accepted CONCURRENCY_LIMIT cuando se excede el pool", async () => {
    const prisma = buildFakePrisma();
    prisma.__seedRun({ id: "run-1" });
    prisma.__seedRun({ id: "run-2" });

    let release: () => void = () => {};
    const slow = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slowExtractor: MarketExtractor = {
      source: "source_a",
      extract: async () => {
        await slow;
        return { kind: "ok", items: [], pagesScanned: 0, cursorOut: null };
      },
    };

    const rt = new MarketWorkerRuntime({
      secret: "shh",
      prisma,
      extractors: new Map([["source_a", slowExtractor]]),
      concurrency: 1,
      defaultDeadlineMs: 50_000,
    });

    const valid = rt.validatePayload(VALID_PAYLOAD);
    if (!valid.ok) throw new Error("payload");
    const valid2 = rt.validatePayload({ ...VALID_PAYLOAD, runId: "run-2" });
    if (!valid2.ok) throw new Error("payload");

    const inflightP = rt.runCrawlSeed(valid.data); // toma el slot
    // Pequeño delay para que el primer run incremente `active` antes
    // del segundo. Sin esto, ambos compiten por el slot.
    await Promise.resolve();

    const blocked = await rt.runCrawlSeed(valid2.data);
    expect(blocked.status).toBe("accepted");
    if (blocked.status !== "accepted") return;
    expect(blocked.reason).toBe("CONCURRENCY_LIMIT");

    release();
    await inflightP;
  });

  it("devuelve accepted DEADLINE_EXCEEDED cuando la extracción supera el deadline; el extractor sigue persistiendo en background", async () => {
    const prisma = buildFakePrisma();
    prisma.__seedRun({ id: "run-1" });

    let resolveExtractor: (r: MarketExtractorResult) => void = () => {};
    const extractorP = new Promise<MarketExtractorResult>((resolve) => {
      resolveExtractor = resolve;
    });
    const extractor: MarketExtractor = {
      source: "source_a",
      extract: async () => extractorP,
    };

    const rt = new MarketWorkerRuntime({
      secret: "shh",
      prisma,
      extractors: new Map([["source_a", extractor]]),
      defaultDeadlineMs: 50, // muy corto a propósito
    });

    const valid = rt.validatePayload({ ...VALID_PAYLOAD, deadlineMs: 50 });
    if (!valid.ok) throw new Error("payload");

    const res = await rt.runCrawlSeed(valid.data);
    expect(res.status).toBe("accepted");
    if (res.status !== "accepted") return;
    expect(res.reason).toBe("DEADLINE_EXCEEDED");

    // Run NO debe estar finalizado todavía
    expect(prisma.__runs.get("run-1")!.status).toBe("RUNNING");

    // Liberamos extractor tarde y damos tiempo a que persista
    resolveExtractor({
      kind: "ok",
      items: [makeItem()],
      pagesScanned: 1,
      cursorOut: null,
    });
    await new Promise((r) => setTimeout(r, 50));

    expect(prisma.__rawListings.size).toBe(1);
    expect(prisma.__runs.get("run-1")!.status).toBe("COMPLETED");
  });
});

describe("MarketWorkerRuntime — health y métricas", () => {
  it("reporta health ok cuando inFlight < concurrency", () => {
    const prisma = buildFakePrisma();
    const rt = new MarketWorkerRuntime({
      secret: "shh",
      prisma,
      extractors: new Map([["source_a", makeExtractor({ kind: "ok", items: [], pagesScanned: 0, cursorOut: null })]]),
      concurrency: 2,
      version: "1.0.0-test",
    });
    const h = rt.health();
    expect(h.status).toBe("ok");
    expect(h.inFlight).toBe(0);
    expect(h.processed).toBe(0);
    expect(h.failed).toBe(0);
    expect(h.version).toBe("1.0.0-test");
  });

  it("incrementa processed tras completed", async () => {
    const prisma = buildFakePrisma();
    prisma.__seedRun({ id: "run-1" });
    const rt = new MarketWorkerRuntime({
      secret: "shh",
      prisma,
      extractors: new Map([["source_a", makeExtractor({ kind: "ok", items: [makeItem()], pagesScanned: 1, cursorOut: null })]]),
    });
    const valid = rt.validatePayload(VALID_PAYLOAD);
    if (!valid.ok) throw new Error("payload");
    await rt.runCrawlSeed(valid.data);
    expect(rt.health().processed).toBe(1);
  });
});

describe("MarketWorkerRuntime — guardarraíles de constructor", () => {
  it("falla sin secret", () => {
    const prisma = buildFakePrisma();
    expect(
      () =>
        new MarketWorkerRuntime({
          secret: "",
          prisma,
          extractors: new Map([["source_a", makeExtractor({ kind: "ok", items: [], pagesScanned: 0, cursorOut: null })]]),
        }),
    ).toThrow();
  });

  it("falla sin extractors", () => {
    const prisma = buildFakePrisma();
    expect(
      () =>
        new MarketWorkerRuntime({
          secret: "shh",
          prisma,
          extractors: new Map(),
        }),
    ).toThrow();
  });
});

// Nota: no se usa `Prisma` directamente en este archivo, pero importarlo
// fuerza al typechecker a validar que el cliente generado existe.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _UseImport = Prisma.JsonValue;
