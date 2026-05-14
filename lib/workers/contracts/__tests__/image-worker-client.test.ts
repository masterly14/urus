import { describe, expect, it, vi } from "vitest";
import { ImageWorkerClient, ImageWorkerError } from "../image-worker-client";

function buildResponse(args: {
  status?: number;
  ok?: boolean;
  body?: unknown;
}): Response {
  const body = args.body == null ? "" : typeof args.body === "string" ? args.body : JSON.stringify(args.body);
  return {
    ok: args.ok ?? (args.status ?? 200) < 400,
    status: args.status ?? 200,
    statusText: "OK",
    text: async () => body,
  } as unknown as Response;
}

describe("ImageWorkerClient", () => {
  it("envía POST con auth header y devuelve respuesta completed", async () => {
    const fetchImpl = vi.fn(async () =>
      buildResponse({
        body: {
          status: "completed",
          statefoxId: "id-1",
          source: "idealista",
          importedCount: 3,
          candidateCount: 8,
          cachedUrls: ["https://res.cloudinary.com/x/a.jpg"],
          elapsedMs: 1234,
        },
      }),
    ) as unknown as typeof fetch;
    const client = new ImageWorkerClient({
      baseUrl: "https://worker.example.com",
      secret: "shh",
      fetchImpl,
    });

    const result = await client.runImageImport({
      statefoxId: "id-1",
      portalUrl: "https://www.idealista.com/inmueble/1/",
      source: "idealista",
      maxImages: 8,
      deadlineMs: 3500,
      traceId: "trace-abc",
    });

    expect(result.status).toBe("completed");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [endpoint, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(endpoint).toBe("https://worker.example.com/internal/image-import/run");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["x-worker-secret"]).toBe("shh");
    expect(headers["x-trace-id"]).toBe("trace-abc");
    const parsedBody = JSON.parse((init as RequestInit).body as string);
    expect(parsedBody).toMatchObject({
      statefoxId: "id-1",
      portalUrl: "https://www.idealista.com/inmueble/1/",
      source: "idealista",
      maxImages: 8,
      deadlineMs: 3500,
      traceId: "trace-abc",
    });
  });

  it("acepta respuesta accepted (worker delegó al job queue)", async () => {
    const fetchImpl = vi.fn(async () =>
      buildResponse({
        body: {
          status: "accepted",
          statefoxId: "id-2",
          source: "idealista",
          jobId: "job-99",
          reason: "deadline excedido",
        },
      }),
    ) as unknown as typeof fetch;
    const client = new ImageWorkerClient({ baseUrl: "https://w", secret: "x", fetchImpl });
    const result = await client.runImageImport({
      statefoxId: "id-2",
      portalUrl: "https://www.idealista.com/inmueble/2/",
    });
    expect(result.status).toBe("accepted");
  });

  it("traduce HTTP 401 a ImageWorkerError UNAUTHORIZED", async () => {
    const fetchImpl = vi.fn(async () =>
      buildResponse({ status: 401, ok: false, body: { error: "unauthorized" } }),
    ) as unknown as typeof fetch;
    const client = new ImageWorkerClient({ baseUrl: "https://w", secret: "x", fetchImpl });
    await expect(
      client.runImageImport({ statefoxId: "id", portalUrl: "https://x" }),
    ).rejects.toMatchObject({ name: "ImageWorkerError", code: "UNAUTHORIZED" });
  });

  it("traduce HTTP 500 a ImageWorkerError REJECTED con mensaje", async () => {
    const fetchImpl = vi.fn(async () =>
      buildResponse({
        status: 500,
        ok: false,
        body: { errorReason: "boom" },
      }),
    ) as unknown as typeof fetch;
    const client = new ImageWorkerClient({ baseUrl: "https://w", secret: "x", fetchImpl });
    await expect(
      client.runImageImport({ statefoxId: "id", portalUrl: "https://x" }),
    ).rejects.toMatchObject({
      name: "ImageWorkerError",
      code: "REJECTED",
      message: "boom",
    });
  });

  it("traduce respuesta no JSON a BAD_RESPONSE", async () => {
    const fetchImpl = vi.fn(async () =>
      buildResponse({ status: 200, body: "not-json" }),
    ) as unknown as typeof fetch;
    const client = new ImageWorkerClient({ baseUrl: "https://w", secret: "x", fetchImpl });
    await expect(
      client.runImageImport({ statefoxId: "id", portalUrl: "https://x" }),
    ).rejects.toMatchObject({ code: "BAD_RESPONSE" });
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
    const client = new ImageWorkerClient({ baseUrl: "https://w", secret: "x", fetchImpl });
    await expect(
      client.runImageImport({
        statefoxId: "id",
        portalUrl: "https://x",
        requestTimeoutMs: 1_000,
      }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("traduce errores de red a NETWORK", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("getaddrinfo ENOTFOUND");
    }) as unknown as typeof fetch;
    const client = new ImageWorkerClient({ baseUrl: "https://w", secret: "x", fetchImpl });
    await expect(
      client.runImageImport({ statefoxId: "id", portalUrl: "https://x" }),
    ).rejects.toMatchObject({ code: "NETWORK" });
  });

  it("requiere baseUrl y secret", () => {
    expect(() => new ImageWorkerClient({ baseUrl: "", secret: "x" })).toThrow(ImageWorkerError);
    expect(() => new ImageWorkerClient({ baseUrl: "https://x", secret: "" })).toThrow(ImageWorkerError);
  });
});
