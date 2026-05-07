/**
 * Calibracion del detail por portal.
 *
 * Toma una URL de detalle real, abre Playwright con la chain del portal y:
 *  1. Captura `before.html` (HTML inicial sin click).
 *  2. Identifica botones candidatos "Ver telefono" (selectores por portal).
 *  3. Hace click en el primero que matchee y espera red estable.
 *  4. Captura `after.html`.
 *  5. Captura un `network.har` (puede no estar habilitado en todas las
 *     estrategias; cuando este disponible, ayuda a identificar AJAX endpoint).
 *
 * Uso:
 *   $env:PORTAL="idealista"; $env:DETAIL_URL="https://www.idealista.com/inmueble/<ID>/"; \
 *     npx tsx scripts/calibrate-portal-detail.ts
 *
 *   $env:PORTAL="fotocasa"; $env:DETAIL_URL="https://www.fotocasa.es/es/comprar/vivienda/<slug>/<ID>/d"; \
 *     npx tsx scripts/calibrate-portal-detail.ts
 *
 *   $env:PORTAL="pisoscom"; $env:DETAIL_URL="https://www.pisos.com/comprar/<slug>-<ID>/"; \
 *     npx tsx scripts/calibrate-portal-detail.ts
 *
 * Output:
 *   workers/market-worker/src/portals/<portal>/__tests__/fixtures/detail/
 *     before.html, after.html, network.har, summary.json
 *
 * Esto NO toca la BD, NO depende del worker corriendo. Es una herramienta
 * 100% offline contra el portal real para identificar selectores y
 * endpoints AJAX antes de implementar el runtime.
 */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page, type Request } from "playwright";

type Portal = "idealista" | "fotocasa" | "pisoscom";

interface PortalConfig {
  portal: Portal;
  /** Selectores candidatos del boton "Ver telefono", ordenados por preferencia. */
  revealSelectors: string[];
  /** Texts (case-insensitive) candidatos para getByText/getByRole. */
  revealTexts: RegExp[];
  /** Cookie banner labels especificos. */
  cookieBannerLabels: RegExp[];
  /** UA preferido. */
  userAgent: string;
}

const PORTALS: Record<Portal, PortalConfig> = {
  idealista: {
    portal: "idealista",
    revealSelectors: [
      "a[data-markup-name='show-phone']",
      "a.see-phones-btn",
      "a[href*='showphone']",
      "button[data-markup-name='show-phone']",
      "[data-markup='see-phones']",
    ],
    revealTexts: [/^ver tel[eé]fono$/i, /mostrar tel[eé]fono/i],
    cookieBannerLabels: [/aceptar/i, /accept/i, /vale/i, /continuar/i],
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  },
  fotocasa: {
    portal: "fotocasa",
    revealSelectors: [
      "[data-testid='see-phone']",
      "[data-test='see-phone']",
      ".re-Phone-button",
      "button.re-ContactDetail-phoneButton",
      "[class*='Phone'] button",
    ],
    revealTexts: [/^ver tel[eé]fono$/i, /mostrar tel[eé]fono/i],
    cookieBannerLabels: [/aceptar todas/i, /aceptar/i, /accept/i],
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  },
  pisoscom: {
    portal: "pisoscom",
    revealSelectors: [
      ".contact-phone-btn",
      "[data-action='show-phone']",
      "button.show-phone",
      "[class*='phone'] button",
      "a[href*='telefono']",
    ],
    revealTexts: [/^ver tel[eé]fono$/i, /mostrar tel[eé]fono/i],
    cookieBannerLabels: [/aceptar/i, /accept/i, /entendido/i],
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  },
};

interface NetworkEvent {
  url: string;
  method: string;
  resourceType: string;
  postData: string | null;
  status: number | null;
  durationMs: number | null;
  responsePreview: string | null;
}

async function main(): Promise<void> {
  const portalArg = (process.env.PORTAL ?? "").toLowerCase();
  const url = process.env.DETAIL_URL;
  if (!url) throw new Error("Falta DETAIL_URL");
  if (!isPortal(portalArg)) {
    throw new Error(`PORTAL invalido: ${portalArg}. Esperado: idealista | fotocasa | pisoscom`);
  }
  const cfg = PORTALS[portalArg];
  const headless = (process.env.PLAYWRIGHT_HEADLESS ?? "true") === "true";

  const outDir = join(
    "workers",
    "market-worker",
    "src",
    "portals",
    portalArg,
    "__tests__",
    "fixtures",
    "detail",
  );
  await mkdir(outDir, { recursive: true });

  console.log(`[calibrate] portal=${portalArg} url=${url} headless=${headless}`);

  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  const events: NetworkEvent[] = [];

  try {
    browser = await chromium.launch({ headless });
    context = await browser.newContext({
      locale: "es-ES",
      timezoneId: "Europe/Madrid",
      viewport: { width: 1366, height: 900 },
      userAgent: cfg.userAgent,
      extraHTTPHeaders: { "Accept-Language": "es-ES,es;q=0.9,en;q=0.8" },
    });
    context.setDefaultTimeout(60_000);
    page = await context.newPage();

    // Captura todas las requests para identificar AJAX del telefono.
    const requestStartTimes = new Map<Request, number>();
    page.on("request", (req) => {
      requestStartTimes.set(req, Date.now());
    });
    page.on("requestfinished", async (req) => {
      const startedAt = requestStartTimes.get(req) ?? Date.now();
      const response = await req.response().catch(() => null);
      let preview: string | null = null;
      if (response) {
        try {
          const buf = await response.body();
          preview = buf.toString("utf8").slice(0, 800);
        } catch {
          preview = null;
        }
      }
      events.push({
        url: req.url(),
        method: req.method(),
        resourceType: req.resourceType(),
        postData: req.postData() ?? null,
        status: response?.status() ?? null,
        durationMs: Date.now() - startedAt,
        responsePreview: preview,
      });
    });

    const navResponse = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    console.log(`[calibrate] HTTP=${navResponse?.status() ?? "?"} carga inicial OK`);

    await acceptCookies(page, cfg.cookieBannerLabels);
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);

    const beforeHtml = await page.content();
    await writeFile(join(outDir, "before.html"), beforeHtml, "utf-8");
    console.log(`[calibrate] before.html guardado (${beforeHtml.length} bytes)`);

    const eventsBeforeClick = events.length;

    const clickResult = await tryClickRevealPhone(page, cfg);
    console.log(
      `[calibrate] click reveal-phone: matched=${clickResult.matched} via=${clickResult.via ?? "none"}`,
    );

    if (clickResult.matched) {
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
      await page.waitForTimeout(2000);
    }

    const afterHtml = await page.content();
    await writeFile(join(outDir, "after.html"), afterHtml, "utf-8");
    console.log(`[calibrate] after.html guardado (${afterHtml.length} bytes)`);

    // Heuristica: candidatas a "endpoint AJAX del telefono".
    const newEvents = events.slice(eventsBeforeClick);
    const phoneEvents = newEvents.filter(
      (e) =>
        e.resourceType === "fetch" ||
        e.resourceType === "xhr" ||
        /phone|telefono|contact/i.test(e.url),
    );

    await writeFile(
      join(outDir, "network.har.json"),
      JSON.stringify({ allEvents: events, phoneCandidates: phoneEvents }, null, 2),
      "utf-8",
    );
    console.log(
      `[calibrate] network capturada: ${events.length} requests, ${phoneEvents.length} candidatas a phone-AJAX`,
    );

    const summary = {
      portal: portalArg,
      url,
      capturedAt: new Date().toISOString(),
      navStatus: navResponse?.status() ?? null,
      revealClick: clickResult,
      phoneCandidatesEndpoints: phoneEvents.map((e) => ({
        url: e.url,
        method: e.method,
        status: e.status,
        durationMs: e.durationMs,
        previewSnippet: e.responsePreview?.slice(0, 200) ?? null,
      })),
      beforeBytes: beforeHtml.length,
      afterBytes: afterHtml.length,
      htmlGrew: afterHtml.length - beforeHtml.length,
    };

    await writeFile(join(outDir, "summary.json"), JSON.stringify(summary, null, 2), "utf-8");
    console.log(`[calibrate] summary.json guardado`);
    console.log(`[calibrate] DONE → ${outDir}`);
  } finally {
    await page?.close().catch(() => undefined);
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}

function isPortal(value: string): value is Portal {
  return value === "idealista" || value === "fotocasa" || value === "pisoscom";
}

async function acceptCookies(page: Page, labels: RegExp[]): Promise<void> {
  for (const label of labels) {
    const button = page.getByRole("button", { name: label }).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click({ timeout: 3000 }).catch(() => undefined);
      await page.waitForTimeout(500);
      return;
    }
  }
}

interface ClickResult {
  matched: boolean;
  via: string | null;
  selectorTried: string[];
}

async function tryClickRevealPhone(page: Page, cfg: PortalConfig): Promise<ClickResult> {
  const tried: string[] = [];

  for (const selector of cfg.revealSelectors) {
    tried.push(`css:${selector}`);
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) {
      await locator.scrollIntoViewIfNeeded().catch(() => undefined);
      await locator.click({ timeout: 3000 }).catch(() => undefined);
      return { matched: true, via: `css:${selector}`, selectorTried: tried };
    }
  }

  for (const text of cfg.revealTexts) {
    tried.push(`text:${text.source}`);
    const byText = page.getByText(text).first();
    if (await byText.isVisible().catch(() => false)) {
      await byText.scrollIntoViewIfNeeded().catch(() => undefined);
      await byText.click({ timeout: 3000 }).catch(() => undefined);
      return { matched: true, via: `text:${text.source}`, selectorTried: tried };
    }
  }

  return { matched: false, via: null, selectorTried: tried };
}

main().catch((err) => {
  console.error("[calibrate] fatal", err);
  process.exit(1);
});
