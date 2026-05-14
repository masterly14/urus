import { describe, expect, it, vi } from "vitest";
import { ChainExhausted, createChainedFetcher } from "../chain";
import { FetcherError, type Fetcher, type FetcherResult } from "../types";

function makeFetcher(name: string, behaviour: () => Promise<FetcherResult>): Fetcher {
  return { name, fetchHtml: behaviour };
}

function ok(html: string, strategy: string): FetcherResult {
  return { html, httpStatus: 200, strategy, elapsedMs: 1 };
}

describe("createChainedFetcher", () => {
  it("requiere al menos un fetcher", () => {
    expect(() =>
      createChainedFetcher({ fetchers: [], isBlocked: () => ({ blocked: false }) }),
    ).toThrow(FetcherError);
  });

  it("devuelve el primer resultado si no está bloqueado", async () => {
    const a = makeFetcher("a", async () => ok("OK", "a"));
    const chain = createChainedFetcher({
      fetchers: [a],
      isBlocked: () => ({ blocked: false }),
    });
    const r = await chain.fetchHtml("https://x");
    expect(r.html).toBe("OK");
    expect(r.strategy).toBe("a");
  });

  it("salta a la siguiente estrategia si la primera está bloqueada", async () => {
    const a = makeFetcher("a", async () => ok("BLOCK", "a"));
    const b = makeFetcher("b", async () => ok("CLEAN", "b"));
    const onFallback = vi.fn();
    const chain = createChainedFetcher({
      fetchers: [a, b],
      isBlocked: (r) => (r.html === "BLOCK" ? { blocked: true, reason: "captcha" } : { blocked: false }),
      onFallback,
    });
    const r = await chain.fetchHtml("https://x", { traceId: "trc" });
    expect(r.html).toBe("CLEAN");
    expect(r.strategy).toBe("b");
    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(onFallback).toHaveBeenCalledWith({
      pageUrl: "https://x",
      fromStrategy: "a",
      toStrategy: "b",
      reason: "captcha",
      traceId: "trc",
    });
  });

  it("salta si la primera estrategia lanza error de transporte", async () => {
    const a = makeFetcher("a", async () => {
      throw new FetcherError("NETWORK", "ECONNRESET", "a");
    });
    const b = makeFetcher("b", async () => ok("OK", "b"));
    const onFallback = vi.fn();
    const chain = createChainedFetcher({
      fetchers: [a, b],
      isBlocked: () => ({ blocked: false }),
      onFallback,
    });
    const r = await chain.fetchHtml("https://x");
    expect(r.html).toBe("OK");
    expect(r.strategy).toBe("b");
    expect(onFallback).toHaveBeenCalledWith(
      expect.objectContaining({ fromStrategy: "a", toStrategy: "b" }),
    );
  });

  it("ChainExhausted tras agotar todas las estrategias bloqueadas", async () => {
    const a = makeFetcher("a", async () => ok("BLOCK", "a"));
    const b = makeFetcher("b", async () => ok("BLOCK", "b"));
    const chain = createChainedFetcher({
      fetchers: [a, b],
      isBlocked: () => ({ blocked: true, reason: "captcha" }),
    });
    await expect(chain.fetchHtml("https://x")).rejects.toBeInstanceOf(ChainExhausted);
  });

  it("ChainExhausted tras agotar todas las estrategias con errores", async () => {
    const a = makeFetcher("a", async () => {
      throw new Error("boom-a");
    });
    const b = makeFetcher("b", async () => {
      throw new Error("boom-b");
    });
    const chain = createChainedFetcher({
      fetchers: [a, b],
      isBlocked: () => ({ blocked: false }),
    });
    try {
      await chain.fetchHtml("https://x");
      throw new Error("debería haber lanzado");
    } catch (err) {
      expect(err).toBeInstanceOf(ChainExhausted);
      const ce = err as ChainExhausted;
      expect(ce.chainAttempts).toHaveLength(2);
      expect(ce.chainAttempts[0]?.error).toContain("boom-a");
      expect(ce.chainAttempts[1]?.error).toContain("boom-b");
    }
  });

  it("no llama a fetchers posteriores cuando uno tuvo éxito", async () => {
    const a = vi.fn(async () => ok("OK", "a"));
    const b = vi.fn(async () => ok("OK", "b"));
    const chain = createChainedFetcher({
      fetchers: [
        { name: "a", fetchHtml: a },
        { name: "b", fetchHtml: b },
      ],
      isBlocked: () => ({ blocked: false }),
    });
    await chain.fetchHtml("https://x");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
  });

  it("propaga timeoutMs y traceId al fetcher subyacente", async () => {
    const a = vi.fn(async (_url: string, opts: { timeoutMs?: number; traceId?: string } | undefined) => ({
      html: "OK",
      httpStatus: 200,
      strategy: "a",
      elapsedMs: 1,
      _captured: opts,
    })) as unknown as (url: string, opts: unknown) => Promise<FetcherResult>;
    const chain = createChainedFetcher({
      fetchers: [{ name: "a", fetchHtml: a }],
      isBlocked: () => ({ blocked: false }),
    });
    await chain.fetchHtml("https://x", { timeoutMs: 9000, traceId: "trc-1" });
    const call = (a as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    expect(call?.[1]).toMatchObject({ timeoutMs: 9000, traceId: "trc-1" });
  });
});
