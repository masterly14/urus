import type { Browser, Page } from "playwright";

export type BrightDataSessionStatus = "running" | "finished" | "failed";
export type BrightDataCaptchaApiStatus = "solved" | "none" | "failed" | "detected";

export type BrightDataSessionDetails = {
  sessionId: string;
  apiName?: string;
  status: BrightDataSessionStatus;
  targetUrl: string | null;
  endUrl: string | null;
  navigations: number;
  durationSeconds: number | null;
  captcha: BrightDataCaptchaApiStatus;
  bandwidthBytes: number;
  errorCode?: string;
  errorMessage?: string;
};

export async function getBrightDataSessionId(target: Browser | Page): Promise<string | undefined> {
  try {
    const browser: Browser =
      typeof (target as Browser).newBrowserCDPSession === "function"
        ? (target as Browser)
        : ((target as Page).context().browser() as Browser);
    if (!browser || typeof browser.newBrowserCDPSession !== "function") {
      console.warn(
        "[brightdata-session] Browser.newBrowserCDPSession no disponible (¿Playwright < 1.31?). Saltando captura de sessionId.",
      );
      return undefined;
    }
    const cdp = await browser.newBrowserCDPSession();
    const send = cdp.send as (method: string, params?: Record<string, unknown>) => Promise<unknown>;
    const result = (await send("Browser.getSessionId")) as { sessionId?: string } | null;
    const sessionId = result?.sessionId?.trim();
    if (!sessionId) {
      console.warn(
        "[brightdata-session] Browser.getSessionId devolvió respuesta vacía. ¿La sesión CDP sigue viva?",
      );
    }
    return sessionId || undefined;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[brightdata-session] Browser.getSessionId falló: ${message}`);
    return undefined;
  }
}

type RawSessionPayload = {
  session?: {
    session_id?: string;
    api_name?: string;
    status?: BrightDataSessionStatus;
    target_url?: string | null;
    end_url?: string | null;
    navigations?: number;
    duration?: number | null;
    captcha?: BrightDataCaptchaApiStatus;
    bandwidth?: number;
    error?: { code?: string; message?: string } | null;
  };
};

export function parseBrightDataSessionPayload(
  payload: RawSessionPayload,
): BrightDataSessionDetails | undefined {
  const raw = payload.session;
  if (!raw?.session_id || !raw.status) return undefined;
  return {
    sessionId: raw.session_id,
    apiName: raw.api_name,
    status: raw.status,
    targetUrl: raw.target_url ?? null,
    endUrl: raw.end_url ?? null,
    navigations: raw.navigations ?? 0,
    durationSeconds: raw.duration ?? null,
    captcha: raw.captcha ?? "none",
    bandwidthBytes: raw.bandwidth ?? 0,
    errorCode: raw.error?.code,
    errorMessage: raw.error?.message,
  };
}

export type FetchBrightDataSessionOptions = {
  sessionId: string;
  apiToken: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export async function fetchBrightDataSession(
  options: FetchBrightDataSessionOptions,
): Promise<BrightDataSessionDetails | undefined> {
  const baseUrl = options.baseUrl ?? "https://api.brightdata.com";
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = `${baseUrl.replace(/\/+$/, "")}/browser_sessions/${encodeURIComponent(options.sessionId)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  try {
    const response = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${options.apiToken}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    if (!response.ok) return undefined;
    const payload = (await response.json()) as RawSessionPayload;
    return parseBrightDataSessionPayload(payload);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

export function formatBrightDataSessionSummary(details: BrightDataSessionDetails): string {
  const parts = [
    `status=${details.status}`,
    `navigations=${details.navigations}`,
    `captcha=${details.captcha}`,
  ];
  if (details.endUrl) parts.push(`end_url=${details.endUrl}`);
  if (details.durationSeconds != null) parts.push(`duration_s=${details.durationSeconds.toFixed(2)}`);
  if (details.bandwidthBytes > 0) parts.push(`bandwidth_kb=${(details.bandwidthBytes / 1024).toFixed(1)}`);
  if (details.errorCode) parts.push(`error_code=${details.errorCode}`);
  if (details.errorMessage) parts.push(`error=${details.errorMessage}`);
  return parts.join(" ");
}
