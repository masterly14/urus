import { isAllowedStatefoxImageUrl } from "./image-url";
import { isExpiredStatefoxImageUrl } from "./image-expiry";

export type PortalImageDiscoveryResult = {
  ok: boolean;
  portalHost: string | null;
  status?: number;
  contentType?: string | null;
  htmlLength?: number;
  candidateCount: number;
  usableCount: number;
  expiredCount: number;
  candidateHosts: string[];
  firstUsableImageUrl: string | null;
  error?: string;
};

function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function normalizeCandidateUrl(value: string): string | null {
  const cleaned = value
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .replace(/\\u0026/g, "&")
    .replace(/\\u003d/g, "=")
    .replace(/\\u003D/g, "=")
    .replace(/\\u007e/g, "~")
    .replace(/\\u007E/g, "~");
  try {
    return new URL(cleaned).toString();
  } catch {
    return null;
  }
}

function extractImageCandidates(html: string): string[] {
  const matches = html.match(/https?:\\?\/\\?\/img[34]\.idealista\.com[^"' <>)\\]+/g) ?? [];
  const urls = matches
    .map(normalizeCandidateUrl)
    .filter((url): url is string => Boolean(url))
    .filter(isAllowedStatefoxImageUrl);
  return Array.from(new Set(urls));
}

export async function discoverPortalImageCandidates(portalUrl: string): Promise<PortalImageDiscoveryResult> {
  const portalHost = hostOf(portalUrl);
  try {
    const response = await fetch(portalUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      },
    });

    const contentType = response.headers.get("content-type");
    const html = await response.text();
    const candidates = extractImageCandidates(html);
    const usable = candidates.filter((url) => !isExpiredStatefoxImageUrl(url));
    const expiredCount = candidates.length - usable.length;

    return {
      ok: response.ok,
      portalHost,
      status: response.status,
      contentType,
      htmlLength: html.length,
      candidateCount: candidates.length,
      usableCount: usable.length,
      expiredCount,
      candidateHosts: Array.from(new Set(candidates.map(hostOf).filter((host): host is string => Boolean(host)))),
      firstUsableImageUrl: usable[0] ?? null,
    };
  } catch (err) {
    return {
      ok: false,
      portalHost,
      candidateCount: 0,
      usableCount: 0,
      expiredCount: 0,
      candidateHosts: [],
      firstUsableImageUrl: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
