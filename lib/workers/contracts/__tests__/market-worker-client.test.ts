import { describe, expect, it, vi } from "vitest";
import { MarketWorkerClient, MarketWorkerError } from "../market-worker-client";
import type { MarketCrawlSeedRequest } from "../market-worker";

function buildResponse(args: {
  status?: number;
  ok?: boolean;
  body?: unknown;
}): Response {
  const body =
    args.body == null
      ? ""
      : typeof args.body === "string"
        ? args.body
        : JSON.stringify(args.body);
  return {
    ok: args.ok ?? (args.status ?? 200) < 400,
    status: args.status ?? 200,
    statusText: "OK",
    text: async () => body,
  } as unknown as Response;
}

function makeRequest(overrides: Partial<MarketCrawlSeedRequest> = {}): MarketCrawlSeedRequest {
  return {
    runId: "run-1",
    seedId: "seed-1",
    source: "source_a",
    operation: "sale",
    url: "https://portal.example.com/cordoba",
    cursor: null,
    budgetMs: 60_000,
    budgetRequests: 50,
    deadlineMs: 8_000,
    traceId: "trace-abc",
    ...overrides,
  };
}

describe("MarketWorkerClient", () => {
  it("envía POST con auth header, trace header y body completo", async () => {
    const fetchImpl = vi.fn(async () =>
      buildResponse({
        body: {
          status: "completed",
          runId: "run-1",
          itemsCaptured: 24,
          itemsRejected: 1,
          pagesScanned: 1,
          cursorOut: "page-2",
          elapsedMs: 4321,
          traceId: "trace-abc",
        },
      }),
    ) as unknown as typeof fetch;
    const client = new MarketWorkerClient({
      baseUrl: "https://worker.example.com",
      secret: "shh",
      fetchImpl,
    });

    const result = await client.runCrawlSeed(makeRequest());

    expect(result.status).toBe("completed");
    if (result.status === "completed") {
      expect(result.itemsCaptured).toBe(24);
      expect(result.cursorOut).toBe("page-2");
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [endpoint, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(endpoint).toBe("https://worker.example.com/internal/market/crawl/seed");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["x-worker-secret"]).toBe("shh");
    expect(headers["x-trace-id"]).toBe("trace-abc");
    const parsedBody = JSON.parse((init as RequestInit).body as string);
    expect(parsedBody).toMatchObject({
      runId: "run-1",
      seedId: "seed-1",
      source: "source_a",
      operation: "sale",
      url: "https://portal.example.com/cordoba",
      budgetMs: 60_000,
      budgetRequests: 50,
      deadlineMs: 8_000,
      traceId: "trace-abc",
    });
  });

  it("acepta respuesta accepted (deadline excedido)", async () => {
    const fetchImpl = vi.fn(async () =>
      buildResponse({
        body: {
          status: "accepted",
          runId: "run-1",
          reason: "DEADLINE_EXCEEDED",
          traceId: "trace-abc",
        },
      }),
    ) as unknown as typeof fetch;
    const client = new MarketWorkerClient({ baseUrl: "https://w", secret: "x", fetchImpl });
    const result = await client.runCrawlSeed(makeRequest());
    expect(result.status).toBe("accepted");
    if (result.status === "accepted") {
      expect(result.reason).toBe("DEADLINE_EXCEEDED");
    }
  });

  it("acepta respuesta blocked", async () => {
    const fetchImpl = vi.fn(async () =>
      buildResponse({
        body: {
          status: "blocked",
          runId: "run-1",
          reason: "DataDome challenge",
          traceId: "trace-abc",
        },
      }),
    ) as unknown as typeof fetch;
    const client = new MarketWorkerClient({ baseUrl: "https://w", secret: "x", fetchImpl });
    const result = await client.runCrawlSeed(makeRequest());
    expect(result.status).toBe("blocked");
  });

  it("traduce HTTP 401 a MarketWorkerError UNAUTHORIZED", async () => {
    const fetchImpl = vi.fn(async () =>
      buildResponse({ status: 401, ok: false, body: { error: "unauthorized" } }),
    ) as unknown as typeof fetch;
    const client = new MarketWorkerClient({ baseUrl: "https://w", secret: "x", fetchImpl });
    await expect(client.runCrawlSeed(makeRequest())).rejects.toMatchObject({
      name: "MarketWorkerError",
      code: "UNAUTHORIZED",
    });
  });

  it("traduce HTTP 500 con errorReason a REJECTED con mensaje", async () => {
    const fetchImpl = vi.fn(async () =>
      buildResponse({
        status: 500,
        ok: false,
        body: { errorReason: "boom" },
      }),
    ) as unknown as typeof fetch;
    const client = new MarketWorkerClient({ baseUrl: "https://w", secret: "x", fetchImpl });
    await expect(client.runCrawlSeed(makeRequest())).rejects.toMatchObject({
      name: "MarketWorkerError",
      code: "REJECTED",
      message: "boom",
    });
  });

  it("traduce respuesta no JSON a BAD_RESPONSE", async () => {
    const fetchImpl = vi.fn(async () =>
      buildResponse({ status: 200, body: "not-json" }),
    ) as unknown as typeof fetch;
    const client = new MarketWorkerClient({ baseUrl: "https://w", secret: "x", fetchImpl });
    await expect(client.runCrawlSeed(makeRequest())).rejects.toMatchObject({
      code: "BAD_RESPONSE",
    });
  });

  it("traduce respuesta con status desconocido a BAD_RESPONSE", async () => {
    const fetchImpl = vi.fn(async () =>
      buildResponse({ status: 200, body: { status: "xxx" } }),
    ) as unknown as typeof fetch;
    const client = new MarketWorkerClient({ baseUrl: "https://w", secret: "x", fetchImpl });
    await expect(client.runCrawlSeed(makeRequest())).rejects.toMatchObject({
      code: "BAD_RESPONSE",
    });
  });

  it("traduce abort por timeout a TIMEOUT", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      return await new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          signal.addEventListener("abort", () => {
            const err = new DOMException("Aborted", "AbortError");
            reject(err);
          });
        }
      });
    }) as unknown as typeof fetch;
    const client = new MarketWorkerClient({ baseUrl: "https://w", secret: "x", fetchImpl });
    await expect(
      client.runCrawlSeed(makeRequest({ deadlineMs: 8_000 })),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("traduce errores de red a NETWORK", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("getaddrinfo ENOTFOUND");
    }) as unknown as typeof fetch;
    const client = new MarketWorkerClient({ baseUrl: "https://w", secret: "x", fetchImpl });
    await expect(client.runCrawlSeed(makeRequest())).rejects.toMatchObject({
      code: "NETWORK",
    });
  });

  it("requiere baseUrl y secret", () => {
    expect(() => new MarketWorkerClient({ baseUrl: "", secret: "x" })).toThrow(MarketWorkerError);
    expect(() => new MarketWorkerClient({ baseUrl: "https://x", secret: "" })).toThrow(
      MarketWorkerError,
    );
  });

  describe("health()", () => {
    it("devuelve estado ok del worker", async () => {
      const fetchImpl = vi.fn(async () =>
        buildResponse({
          body: {
            status: "ok",
            uptimeSeconds: 120,
            inFlight: 1,
            processed: 42,
            failed: 0,
            version: "1.0.0",
          },
        }),
      ) as unknown as typeof fetch;
      const client = new MarketWorkerClient({ baseUrl: "https://w", secret: "x", fetchImpl });
      const h = await client.health();
      expect(h.status).toBe("ok");
      expect(h.processed).toBe(42);
    });

    it("traduce 401 a UNAUTHORIZED", async () => {
      const fetchImpl = vi.fn(async () =>
        buildResponse({ status: 401, ok: false, body: { error: "no" } }),
      ) as unknown as typeof fetch;
      const client = new MarketWorkerClient({ baseUrl: "https://w", secret: "x", fetchImpl });
      await expect(client.health()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("traduce respuesta inválida a BAD_RESPONSE", async () => {
      const fetchImpl = vi.fn(async () =>
        buildResponse({ status: 200, body: { status: "weird" } }),
      ) as unknown as typeof fetch;
      const client = new MarketWorkerClient({ baseUrl: "https://w", secret: "x", fetchImpl });
      await expect(client.health()).rejects.toMatchObject({ code: "BAD_RESPONSE" });
    });
  });

  describe("runCrawlDetail()", () => {
    it("envía request de detalle y acepta completed", async () => {
      const fetchImpl = vi.fn(async () =>
        buildResponse({
          body: {
            status: "completed",
            source: "source_d",
            canonicalUrl: "https://www.idealista.com/inmueble/123456789/",
            phones: ["+34600111222"],
            advertiserName: "Particular",
            advertiserType: "particular",
            httpStatus: 200,
            strategy: "web-unlocker",
            traceId: "trace-detail-1",
          },
        }),
      ) as unknown as typeof fetch;
      const client = new MarketWorkerClient({
        baseUrl: "https://worker.example.com",
        secret: "shh",
        fetchImpl,
      });

      const result = await client.runCrawlDetail({
        source: "source_d",
        canonicalUrl: "https://www.idealista.com/inmueble/123456789/",
        externalId: "123456789",
        timeoutMs: 45_000,
        traceId: "trace-detail-1",
      });

      expect(result.status).toBe("completed");
      if (result.status !== "completed") return;
      expect(result.phones).toEqual(["+34600111222"]);

      const [endpoint, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(endpoint).toBe("https://worker.example.com/internal/market/crawl/detail");
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body).toMatchObject({
        source: "source_d",
        canonicalUrl: "https://www.idealista.com/inmueble/123456789/",
        externalId: "123456789",
      });
    });

    it("traduce status inválido a BAD_RESPONSE", async () => {
      const fetchImpl = vi.fn(async () =>
        buildResponse({ status: 200, body: { status: "unknown" } }),
      ) as unknown as typeof fetch;
      const client = new MarketWorkerClient({ baseUrl: "https://w", secret: "x", fetchImpl });

      await expect(
        client.runCrawlDetail({
          source: "source_a",
          canonicalUrl: "https://www.fotocasa.es/es/comprar/vivienda/x/d",
          traceId: "trace-detail-2",
        }),
      ).rejects.toMatchObject({ code: "BAD_RESPONSE" });
    });
  });
});
