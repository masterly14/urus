import type { StatefoxPortalSource } from "@prisma/client";
import { createScrapingBrowserKit } from "@/lib/scraping/browser";
import { waitForBrightDataCaptcha } from "@/lib/scraping/brightdata-captcha";
import { serializeCookies } from "@/lib/scraping/cookies";
import type { WarmedCookies, WarmSessionRequest } from "./types";

const PORTAL_HOME_URL: Record<Exclude<StatefoxPortalSource, "unknown">, string> = {
  idealista: "https://www.idealista.com/",
  fotocasa: "https://www.fotocasa.es/",
  pisoscom: "https://www.pisos.com/",
  habitaclia: "https://www.habitaclia.com/",
};

export function homeUrlForWarmSession(source: Exclude<StatefoxPortalSource, "unknown">): string {
  return PORTAL_HOME_URL[source];
}

export async function warmPortalSession(request: WarmSessionRequest): Promise<WarmedCookies> {
  if (!request.brightDataUrl) {
    throw new Error("BRIGHTDATA_SCRAPING_BROWSER_URL es obligatorio para calentar cookies");
  }

  const homeUrl = homeUrlForWarmSession(request.source);
  const kit = await createScrapingBrowserKit({
    source: request.source,
    headless: request.headless,
    brightDataUrl: request.brightDataUrl,
    brightDataConnectTimeoutMs: request.brightDataConnectTimeoutMs,
  });

  try {
    const { context, page } = kit;
    await page.goto(homeUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    if (request.captchaSolveEnabled) {
      const captcha = await waitForBrightDataCaptcha(page, request.captchaDetectTimeoutMs);
      if (captcha.status === "solve_failed") {
        throw new Error(captcha.message ?? "Bright Data no pudo resolver CAPTCHA");
      }
    }
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
    await page.mouse.move(240, 320, { steps: 12 }).catch(() => undefined);
    await page.mouse.wheel(0, 500).catch(() => undefined);
    await page.waitForTimeout(700).catch(() => undefined);

    const cookies = await context.cookies(homeUrl);
    const cookieHeader = serializeCookies(cookies);
    if (!cookieHeader) {
      throw new Error(`Bright Data CDP no devolvió cookies para ${homeUrl}`);
    }
    const userAgent = await page.evaluate(() => navigator.userAgent).catch(() => undefined);
    if (!userAgent) {
      throw new Error("No se pudo leer navigator.userAgent durante el warming");
    }

    return {
      cookieHeader,
      userAgent,
      proxySession: process.env.BRIGHTDATA_RESIDENTIAL_PROXY_SESSION?.trim() || undefined,
    };
  } finally {
    await kit.browser.close().catch(() => undefined);
  }
}
