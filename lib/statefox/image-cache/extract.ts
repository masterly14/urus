import type { StatefoxPortalSource } from "@prisma/client";
import type { Browser, BrowserContext, Page, Response } from "playwright";
import {
  acceptCookieBannerIfPresent,
  assertIdealistaPageAccessible,
  politeDelay,
} from "@/lib/idealista/browser";
import { IDEALISTA_USER_AGENT } from "@/lib/idealista/config";
import { createHumanCursor } from "@/lib/scraping/human-cursor";
import { createScrapingBrowserKit, type ScrapingBrowserMode } from "@/lib/scraping/browser";
import { waitForBrightDataCaptcha } from "@/lib/scraping/brightdata-captcha";
import {
  fetchBrightDataSession,
  formatBrightDataSessionSummary,
  getBrightDataSessionId,
  type BrightDataSessionDetails,
} from "@/lib/scraping/brightdata-session";
import { acquireWarmSession, incrementWarmSessionUsage, invalidateWarmSession } from "@/lib/scraping/warm-session";
import { homeUrlForWarmSession } from "@/lib/scraping/warm-session/warm";
import { politeNavigate } from "@/lib/scraping/warmup-navigation";
import { unlockUrl } from "@/lib/scraping/web-unlocker";
import { getStatefoxImageImportConfig } from "./config";
import { filterPortalCandidates } from "./filter";
import { detectPortalSource } from "./portal";
import type { PortalImageCandidate, PortalImageDiscovery } from "./types";

const IMAGE_URL_RE =
  /https?:\/\/[^"'<>)\s\\]+?\.(?:jpe?g|png|webp|avif)(?:\?[^"'<>)\s\\]*)?/gi;

function preNormalizeText(text: string): string {
  return text
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .replace(/\\u002[fF]/g, "/")
    .replace(/\\u0026/g, "&")
    .replace(/\\u003[dD]/g, "=");
}

function normalizeCandidateUrl(value: string): string | null {
  const cleaned = value
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .replace(/\\u0026/g, "&")
    .replace(/\\u003d/g, "=")
    .replace(/\\u003D/g, "=");
  try {
    const url = new URL(cleaned);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function pushUnique(
  target: PortalImageCandidate[],
  seen: Set<string>,
  candidate: PortalImageCandidate,
): void {
  const normalized = normalizeCandidateUrl(candidate.url);
  if (!normalized || seen.has(normalized)) return;
  seen.add(normalized);
  target.push({ ...candidate, url: normalized });
}

export function extractImageCandidatesFromText(
  text: string,
  source: PortalImageCandidate["source"] = "script",
): PortalImageCandidate[] {
  const candidates: PortalImageCandidate[] = [];
  const seen = new Set<string>();
  const normalized = preNormalizeText(text);
  for (const match of normalized.matchAll(IMAGE_URL_RE)) {
    if (!match[0]) continue;
    pushUnique(candidates, seen, { url: match[0], source });
  }
  return candidates;
}

async function extractDomAndScriptCandidates(page: Page): Promise<PortalImageCandidate[]> {
  const raw = await page.evaluate(() => {
    const urls: Array<{ url: string; source: "dom" | "script"; width?: number; height?: number }> = [];
    for (const img of Array.from(document.querySelectorAll("img"))) {
      const element = img as HTMLImageElement;
      const values = [
        element.currentSrc,
        element.src,
        element.getAttribute("data-src"),
        element.getAttribute("data-original"),
      ].filter(Boolean) as string[];
      for (const url of values) {
        urls.push({
          url,
          source: "dom",
          width: element.naturalWidth || undefined,
          height: element.naturalHeight || undefined,
        });
      }
      const srcset = element.getAttribute("srcset");
      if (srcset) {
        for (const part of srcset.split(",")) {
          const url = part.trim().split(/\s+/)[0];
          if (url) urls.push({ url, source: "dom" });
        }
      }
    }

    for (const source of Array.from(document.querySelectorAll("source[srcset]"))) {
      const srcset = source.getAttribute("srcset");
      if (!srcset) continue;
      for (const part of srcset.split(",")) {
        const url = part.trim().split(/\s+/)[0];
        if (url) urls.push({ url, source: "dom" });
      }
    }

    const scriptText = Array.from(document.scripts)
      .map((script) => script.textContent ?? "")
      .join("\n");
    urls.push({ url: scriptText, source: "script" });
    return urls;
  });

  const candidates: PortalImageCandidate[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (item.source === "script") {
      for (const candidate of extractImageCandidatesFromText(item.url, "script")) {
        pushUnique(candidates, seen, candidate);
      }
    } else {
      pushUnique(candidates, seen, item);
    }
  }
  return candidates;
}

function classifyPageText(text: string): PortalImageDiscovery["status"] | null {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/captcha|robot|verifica que no eres|unusual traffic/.test(normalized)) return "captcha";
  if (/uso indebido|acceso se ha bloqueado|access denied|forbidden|bloqueado/.test(normalized)) {
    return "blocked";
  }
  if (/anuncio no encontrado|inmueble no encontrado|ya no esta disponible|no longer available/.test(normalized)) {
    return "listing_removed";
  }
  return null;
}

async function cookieHeaderForUrl(context: BrowserContext, url: string): Promise<string | undefined> {
  const cookies = await context.cookies(url).catch(() => []);
  if (cookies.length === 0) return undefined;
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

async function openPhotoGalleryIfPresent(page: Page): Promise<void> {
  const candidates = [
    /ver fotos/i,
    /fotos/i,
    /galería/i,
    /galeria/i,
    /photos/i,
  ];
  for (const name of candidates) {
    const locator = page.getByRole("button", { name }).first();
    if (await locator.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await locator.click({ timeout: 2_500 }).catch(() => undefined);
      await page.waitForTimeout(1_000).catch(() => undefined);
      return;
    }
  }
}

export async function discoverPortalImages(portalUrl: string): Promise<PortalImageDiscovery> {
  const config = getStatefoxImageImportConfig();
  const source = detectPortalSource(portalUrl);
  if (source === "unknown") {
    return {
      source,
      portalUrl,
      candidates: [],
      status: "failed",
      errorReason: "Portal no soportado",
    };
  }

  if (
    source === "idealista" &&
    config.webUnlockerEnabled &&
    config.webUnlockerZone &&
    config.brightDataApiToken
  ) {
    return discoverViaWebUnlocker(portalUrl, source, config);
  }

  const networkCandidates: PortalImageCandidate[] = [];
  const seenNetwork = new Set<string>();
  let kit: { mode: ScrapingBrowserMode; browser: Browser; context: BrowserContext; page: Page } | null = null;
  let warmSessionId: string | undefined;
  let brightDataSessionId: string | undefined;
  let brightDataSession: BrightDataSessionDetails | undefined;
  let result: PortalImageDiscovery = {
    source,
    portalUrl,
    candidates: [],
    status: "failed",
    errorReason: "Discovery no completado",
  };
  try {
    const useDirectCdp =
      source === "idealista" &&
      Boolean(config.brightDataUrl) &&
      config.idealistaDirectCdpEnabled;
    const warmSession =
      source === "idealista" && config.warmSessionEnabled && !useDirectCdp
        ? await acquireWarmSession({
            source,
            policy: {
              enabled: true,
              requireCdp: config.warmSessionRequireCdp,
              ttlMs: config.warmSessionTtlMs,
              maxRequests: config.warmSessionMaxRequests,
            },
            headless: config.headless,
            brightDataUrl: config.brightDataUrl,
            brightDataConnectTimeoutMs: config.brightDataConnectTimeoutMs,
            captchaSolveEnabled: config.brightDataCaptchaSolve,
            captchaDetectTimeoutMs: config.brightDataCaptchaDetectTimeoutMs,
          })
        : null;
    if (warmSession?.status === "unavailable" && config.warmSessionRequireCdp) {
      result = {
        source,
        portalUrl,
        candidates: [],
        status: "blocked",
        errorReason: warmSession.reason,
      };
      return result;
    }
    warmSessionId = warmSession?.status === "ready" ? warmSession.session.id : undefined;
    const brightDataUrlForKit = useDirectCdp
      ? config.brightDataUrl
      : warmSession?.status === "ready"
        ? undefined
        : config.brightDataUrl;
    kit = await createScrapingBrowserKit({
      source,
      headless: config.headless,
      storageStatePath: config.storageStatePath,
      brightDataUrl: brightDataUrlForKit,
      brightDataResidentialProxyUrl: config.brightDataResidentialProxyUrl,
      brightDataResidentialProxyUsername: config.brightDataResidentialProxyUsername,
      brightDataResidentialProxyPassword: config.brightDataResidentialProxyPassword,
      brightDataResidentialProxySession: config.brightDataResidentialProxySession,
      brightDataConnectTimeoutMs: config.brightDataConnectTimeoutMs,
      cookieHeader: warmSession?.status === "ready" ? warmSession.session.cookieHeader : undefined,
      cookieUrl: homeUrlForWarmSession(source),
      userAgent: warmSession?.status === "ready" ? warmSession.session.userAgent : undefined,
    });
    const { context, page } = kit;
    page.on("response", (response: Response) => {
      const contentType = response.headers()["content-type"] ?? "";
      if (!contentType.startsWith("image/")) return;
      pushUnique(networkCandidates, seenNetwork, {
        url: response.url(),
        source: "network",
      });
    });

    const cursor = createHumanCursor(page, config.humanBehaviorEnabled);
    let response: Response | null;
    if (kit.mode === "brightdata") {
      const cdpTimeoutMs = Math.max(config.timeoutMs, 120_000);
      const setTimeout = (page as unknown as { setDefaultNavigationTimeout?: (ms: number) => void })
        .setDefaultNavigationTimeout;
      if (typeof setTimeout === "function") setTimeout.call(page, cdpTimeoutMs);
      response = await page.goto(portalUrl, {
        waitUntil: "domcontentloaded",
        timeout: cdpTimeoutMs,
      });
      brightDataSessionId = await getBrightDataSessionId(kit.browser);
    } else {
      response = await politeNavigate(source, page, cursor, portalUrl, {
        totalTimeoutMs: config.timeoutMs,
        warmupEnabled: config.warmupNavigationEnabled,
      });
    }
    if (warmSessionId) {
      await incrementWarmSessionUsage(warmSessionId);
    }
    if (kit.mode === "brightdata" && config.brightDataCaptchaSolve) {
      const captcha = await waitForBrightDataCaptcha(
        page,
        config.brightDataCaptchaDetectTimeoutMs,
      );
      if (captcha.status === "solve_failed") {
        result = {
          source,
          portalUrl,
          candidates: [],
          status: "captcha",
          errorReason: captcha.message ?? "Bright Data no pudo resolver CAPTCHA",
          cookies: await cookieHeaderForUrl(context, portalUrl),
          userAgent: IDEALISTA_USER_AGENT,
        };
        return result;
      }
      if (captcha.status === "solved") {
        await page.waitForLoadState("domcontentloaded", { timeout: 5_000 }).catch(() => undefined);
      }
    }
    await acceptCookieBannerIfPresent(page);
    const networkIdleTimeout =
      kit.mode === "brightdata" ? config.brightDataNetworkIdleTimeoutMs : 10_000;
    await page.waitForLoadState("networkidle", { timeout: networkIdleTimeout }).catch(() => undefined);
    if (source === "idealista" && kit.mode === "local") {
      await assertIdealistaPageAccessible(page, portalUrl);
      if (config.idealistaDelayMs > 0) {
        await politeDelay(config.idealistaDelayMs + Math.floor(Math.random() * 750));
      }
    }
    await openPhotoGalleryIfPresent(page);

    const pageText = await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
    const classified = classifyPageText(pageText);
    if (classified) {
      if (warmSessionId && (classified === "blocked" || classified === "captcha")) {
        await invalidateWarmSession(warmSessionId, `Portal clasificado como ${classified}`);
      }
      result = {
        source,
        portalUrl,
        candidates: [],
        status: classified,
        errorReason: `Portal clasificado como ${classified}`,
        cookies: await cookieHeaderForUrl(context, portalUrl),
        userAgent: IDEALISTA_USER_AGENT,
      };
      return result;
    }
    if (response && [401, 403, 429].includes(response.status())) {
      if (warmSessionId) {
        await invalidateWarmSession(warmSessionId, `HTTP ${response.status()} al abrir portal`);
      }
      result = {
        source,
        portalUrl,
        candidates: [],
        status: response.status() === 429 ? "blocked" : "blocked",
        errorReason: `HTTP ${response.status()} al abrir portal`,
        cookies: await cookieHeaderForUrl(context, portalUrl),
        userAgent: IDEALISTA_USER_AGENT,
      };
      return result;
    }

    const domCandidates = await extractDomAndScriptCandidates(page);
    const allCandidates: PortalImageCandidate[] = [];
    const seenAll = new Set<string>();
    for (const candidate of [...networkCandidates, ...domCandidates]) {
      pushUnique(allCandidates, seenAll, candidate);
    }
    const filteredCandidates = filterPortalCandidates(source, allCandidates);

    result = {
      source,
      portalUrl,
      candidates: filteredCandidates.slice(0, config.maxImages * 3),
      status: filteredCandidates.length > 0 ? "ok" : "no_images_found",
      errorReason: filteredCandidates.length > 0 ? undefined : "No se encontraron imágenes en portal",
      cookies: await cookieHeaderForUrl(context, portalUrl),
      userAgent: IDEALISTA_USER_AGENT,
    };
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = /captcha/i.test(message)
      ? "captcha"
      : /bloque|block|forbidden|403|uso indebido/i.test(message)
        ? "blocked"
        : "failed";
    if (warmSessionId && (status === "blocked" || status === "captcha")) {
      await invalidateWarmSession(warmSessionId, message);
    }
    result = {
      source,
      portalUrl,
      candidates: [],
      status,
      errorReason: message,
    };
    return result;
  } finally {
    await kit?.browser.close().catch(() => undefined);
    if (brightDataSessionId) {
      result.brightDataSessionId = brightDataSessionId;
      if (config.brightDataApiToken && config.brightDataSessionInspectEnabled) {
        brightDataSession = await fetchBrightDataSession({
          sessionId: brightDataSessionId,
          apiToken: config.brightDataApiToken,
        });
        if (brightDataSession) {
          result.brightDataSession = brightDataSession;
          if (
            (result.status === "blocked" || result.status === "captcha" || result.status === "failed")
            && !result.errorReason?.includes("brightdata=")
          ) {
            const summary = formatBrightDataSessionSummary(brightDataSession);
            result.errorReason = `${result.errorReason ?? "Bloqueo"} | brightdata={${summary}}`;
          }
        }
      }
    }
  }
}

async function discoverViaWebUnlocker(
  portalUrl: string,
  source: Exclude<StatefoxPortalSource, "unknown">,
  config: ReturnType<typeof getStatefoxImageImportConfig>,
): Promise<PortalImageDiscovery> {
  const outcome = await unlockUrl({
    url: portalUrl,
    zone: config.webUnlockerZone!,
    apiToken: config.brightDataApiToken!,
    timeoutMs: config.webUnlockerTimeoutMs,
    country: config.webUnlockerCountry,
  });

  if (!outcome.ok) {
    const codePart = outcome.errorCode ? `[${outcome.errorCode}] ` : "";
    const statusPart = outcome.status ? `HTTP ${outcome.status}` : "Error";
    const status: PortalImageDiscovery["status"] =
      outcome.status === 401 || outcome.status === 403 || outcome.status === 429 ? "blocked" : "failed";
    return {
      source,
      portalUrl,
      candidates: [],
      status,
      errorReason: `Web Unlocker: ${statusPart} ${codePart}${outcome.errorMessage}`.trim(),
    };
  }

  const rawCandidates = extractImageCandidatesFromText(outcome.html, "script");
  const candidates = filterPortalCandidates(source, rawCandidates);
  return {
    source,
    portalUrl,
    candidates: candidates.slice(0, config.maxImages * 3),
    status: candidates.length > 0 ? "ok" : "no_images_found",
    errorReason: candidates.length > 0
      ? undefined
      : "No se encontraron imágenes en el HTML devuelto por Web Unlocker",
    userAgent: IDEALISTA_USER_AGENT,
  };
}
