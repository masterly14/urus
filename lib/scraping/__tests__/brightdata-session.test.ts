import { describe, expect, it, vi } from "vitest";
import {
  fetchBrightDataSession,
  formatBrightDataSessionSummary,
  parseBrightDataSessionPayload,
} from "../brightdata-session";

describe("parseBrightDataSessionPayload", () => {
  it("normaliza una sesión finished con captcha resuelto", () => {
    const parsed = parseBrightDataSessionPayload({
      session: {
        session_id: "abc-123",
        api_name: "scraping_browser1",
        status: "finished",
        target_url: "https://www.idealista.com/inmueble/1/",
        end_url: "https://www.idealista.com/inmueble/1/galeria",
        navigations: 3,
        duration: 87.21,
        captcha: "solved",
        bandwidth: 2_500_000,
        error: null,
      },
    });
    expect(parsed).toMatchObject({
      sessionId: "abc-123",
      status: "finished",
      navigations: 3,
      captcha: "solved",
      bandwidthBytes: 2_500_000,
    });
    expect(parsed?.errorCode).toBeUndefined();
  });

  it("conserva error.code y error.message para sesiones fallidas", () => {
    const parsed = parseBrightDataSessionPayload({
      session: {
        session_id: "abc-456",
        status: "failed",
        target_url: "https://www.idealista.com/inmueble/1/",
        end_url: null,
        navigations: 0,
        duration: 4.1,
        captcha: "none",
        bandwidth: 0,
        error: { code: "navigation_blocked", message: "DataDome challenge" },
      },
    });
    expect(parsed?.errorCode).toBe("navigation_blocked");
    expect(parsed?.errorMessage).toBe("DataDome challenge");
  });

  it("descarta payloads sin session.session_id", () => {
    expect(parseBrightDataSessionPayload({})).toBeUndefined();
    expect(
      parseBrightDataSessionPayload({ session: { status: "finished" } as never }),
    ).toBeUndefined();
  });
});

describe("formatBrightDataSessionSummary", () => {
  it("imprime los campos accionables", () => {
    const summary = formatBrightDataSessionSummary({
      sessionId: "abc",
      status: "failed",
      targetUrl: null,
      endUrl: "https://example.com/captcha",
      navigations: 1,
      durationSeconds: 3.5,
      captcha: "failed",
      bandwidthBytes: 1024 * 5,
      errorCode: "captcha_failed",
      errorMessage: "could not solve",
    });
    expect(summary).toContain("status=failed");
    expect(summary).toContain("navigations=1");
    expect(summary).toContain("captcha=failed");
    expect(summary).toContain("end_url=https://example.com/captcha");
    expect(summary).toContain("duration_s=3.50");
    expect(summary).toContain("bandwidth_kb=5.0");
    expect(summary).toContain("error_code=captcha_failed");
  });
});

describe("fetchBrightDataSession", () => {
  it("envía Authorization Bearer y parsea la respuesta", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        session: {
          session_id: "abc-789",
          status: "finished",
          target_url: "https://www.idealista.com/inmueble/1/",
          end_url: "https://www.idealista.com/inmueble/1/",
          navigations: 1,
          duration: 12.3,
          captcha: "none",
          bandwidth: 1_024,
          error: null,
        },
      }),
    })) as unknown as typeof fetch;

    const result = await fetchBrightDataSession({
      sessionId: "abc-789",
      apiToken: "secret-token",
      fetchImpl,
    });

    expect(result?.sessionId).toBe("abc-789");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const callArgs = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs?.[0]).toBe("https://api.brightdata.com/browser_sessions/abc-789");
    expect((callArgs?.[1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer secret-token",
    });
  });

  it("devuelve undefined si la API responde !ok", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
    const result = await fetchBrightDataSession({
      sessionId: "abc",
      apiToken: "x",
      fetchImpl,
    });
    expect(result).toBeUndefined();
  });

  it("devuelve undefined si fetch lanza", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const result = await fetchBrightDataSession({
      sessionId: "abc",
      apiToken: "x",
      fetchImpl,
    });
    expect(result).toBeUndefined();
  });
});
