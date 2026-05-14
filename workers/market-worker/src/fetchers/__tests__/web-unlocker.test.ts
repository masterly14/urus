import { describe, expect, it, vi } from "vitest";
import { createWebUnlockerFetcher } from "../web-unlocker";
import { FetcherError } from "../types";

function buildResponse(args: {
  status?: number;
  ok?: boolean;
  body: string;
  headers?: Record<string, string>;
}): Response {
  return {
    ok: args.ok ?? (args.status ?? 200) < 400,
    status: args.status ?? 200,
    statusText: "OK",
    headers: {
      get: (name: string) => args.headers?.[name.toLowerCase()] ?? null,
    },
    text: async () => args.body,
  } as unknown as Response;
}

describe("createWebUnlockerFetcher", () => {
  it("falla si falta apiToken", () => {
    expect(() => createWebUnlockerFetcher({ apiToken: "", zone: "z" })).toThrow(FetcherError);
  });

  it("falla si falta zone", () => {
    expect(() => createWebUnlockerFetcher({ apiToken: "tok", zone: "" })).toThrow(FetcherError);
  });

  it("envía POST a /request con Authorization Bearer y devuelve HTML", async () => {
    const fetchImpl = vi.fn(async () =>
      buildResponse({ status: 200, body: "<html>ok</html>" }),
    ) as unknown as typeof fetch;
    const fetcher = createWebUnlockerFetcher({
      apiToken: "tok-abc",
      zone: "datacenter_unlock",
      country: "es",
      fetchImpl,
    });
    const r = await fetcher.fetchHtml("https://www.fotocasa.es/x");
    expect(r.html).toBe("<html>ok</html>");
    expect(r.httpStatus).toBe(200);
    expect(r.strategy).toBe("web-unlocker");
    expect(r.elapsedMs).toBeGreaterThanOrEqual(0);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [endpoint, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(endpoint).toBe("https://api.brightdata.com/request");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer tok-abc");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      zone: "datacenter_unlock",
      url: "https://www.fotocasa.es/x",
      format: "raw",
      country: "es",
    });
  });

  it("traduce 401/403 a FetcherError UNAUTHORIZED", async () => {
    const fetchImpl = vi.fn(async () => buildResponse({ status: 401, ok: false, body: "no" })) as unknown as typeof fetch;
    const fetcher = createWebUnlockerFetcher({ apiToken: "t", zone: "z", fetchImpl });
    await expect(fetcher.fetchHtml("https://x")).rejects.toMatchObject({
      name: "FetcherError",
      code: "UNAUTHORIZED",
    });
  });

  it("traduce errores HTTP genéricos a FetcherError HTTP_ERROR", async () => {
    const fetchImpl = vi.fn(async () => buildResponse({ status: 500, ok: false, body: "boom" })) as unknown as typeof fetch;
    const fetcher = createWebUnlockerFetcher({ apiToken: "t", zone: "z", fetchImpl });
    await expect(fetcher.fetchHtml("https://x")).rejects.toMatchObject({
      name: "FetcherError",
      code: "HTTP_ERROR",
    });
  });

  it("propaga blocked=true cuando el HTML es pagina de captcha DataDome", async () => {
    const fetchImpl = vi.fn(async () =>
      buildResponse({
        status: 200,
        body: "<html><script src='https://geo.captcha-delivery.com/captcha/?cid=abc'></script></html>",
      }),
    ) as unknown as typeof fetch;
    const fetcher = createWebUnlockerFetcher({ apiToken: "t", zone: "z", fetchImpl });
    const r = await fetcher.fetchHtml("https://www.idealista.com/x");
    expect(r.blocked).toBe(true);
    expect(r.blockedReason).toBe("datadome");
    expect(r.html).toContain("captcha-delivery");
  });

  it("propaga blocked=true cuando x-final-status es 403", async () => {
    const fetchImpl = vi.fn(async () =>
      buildResponse({
        status: 200,
        headers: { "x-final-status": "403" },
        body: "<html>nope</html>",
      }),
    ) as unknown as typeof fetch;
    const fetcher = createWebUnlockerFetcher({ apiToken: "t", zone: "z", fetchImpl });
    const r = await fetcher.fetchHtml("https://www.idealista.com/x");
    expect(r.blocked).toBe(true);
    expect(r.blockedReason).toBe("http_403");
  });
});
