// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStatefoxImageCachePolling } from "../use-image-cache-polling";

function buildResponse(items: Array<{
  statefoxId: string;
  status: string;
  cachedUrls: string[];
}>): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      items: items.map((item) => ({
        statefoxId: item.statefoxId,
        status: item.status,
        cachedUrls: item.cachedUrls,
        importedCount: item.cachedUrls.length,
        attempts: 1,
        errorReason: null,
        updatedAt: new Date().toISOString(),
      })),
      count: items.length,
      timestamp: new Date().toISOString(),
    }),
  } as unknown as Response;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useStatefoxImageCachePolling", () => {
  it("hace polling y actualiza el mapa de items cuando llegan IMPORTED", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(buildResponse([{ statefoxId: "a", status: "PENDING", cachedUrls: [] }]))
      .mockResolvedValueOnce(
        buildResponse([{ statefoxId: "a", status: "IMPORTED", cachedUrls: ["https://cdn/a.jpg"] }]),
      ) as unknown as typeof fetch;

    const { result } = renderHook(() =>
      useStatefoxImageCachePolling({
        ids: ["a"],
        intervalMs: 100,
        fetchImpl,
      }),
    );

    await waitFor(() => {
      expect(result.current.items.get("a")?.status).toBe("PENDING");
    });
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    await waitFor(() => {
      expect(result.current.items.get("a")?.status).toBe("IMPORTED");
    });
    expect(result.current.items.get("a")?.cachedUrls).toEqual(["https://cdn/a.jpg"]);
  });

  it("no consulta si enabled=false", async () => {
    const fetchImpl = vi.fn(async () =>
      buildResponse([{ statefoxId: "a", status: "PENDING", cachedUrls: [] }]),
    ) as unknown as typeof fetch;

    renderHook(() =>
      useStatefoxImageCachePolling({
        ids: ["a"],
        enabled: false,
        fetchImpl,
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("se detiene en cuanto todos los items están en estado terminal", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      buildResponse([
        { statefoxId: "a", status: "IMPORTED", cachedUrls: ["https://cdn/a.jpg"] },
        { statefoxId: "b", status: "BLOCKED", cachedUrls: [] },
      ]),
    ) as unknown as typeof fetch;

    renderHook(() =>
      useStatefoxImageCachePolling({
        ids: ["a", "b"],
        intervalMs: 50,
        fetchImpl,
      }),
    );

    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("guarda lastError si la API responde !ok", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 500,
    })) as unknown as typeof fetch;

    const { result } = renderHook(() =>
      useStatefoxImageCachePolling({
        ids: ["a"],
        intervalMs: 100,
        fetchImpl,
      }),
    );

    await waitFor(() => expect(result.current.lastError).toBeTruthy());
  });
});
