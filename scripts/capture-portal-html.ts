/**
 * Captura HTML real de los portales del Core (Fotocasa, Pisos.com,
 * Milanuncios, Idealista) para calibrar los parsers contra estructura real.
 *
 * Modo Playwright local (default): UA real, locale es-ES y cookie banner.
 * Apto para Fotocasa y Pisos.com (laxos).
 *
 * Modo Web Unlocker (`--via-web-unlocker`): usa Bright Data Web Unlocker REST
 * API. Recomendado para Idealista (DataDome). Requiere:
 *   - BRIGHTDATA_API_TOKEN
 *   - --zone <zone>            (ej. web_unlocker_market)
 *   - --country <iso2>          (default es)
 *
 * Uso:
 *   npx tsx scripts/capture-portal-html.ts --portal fotocasa --city cordoba
 *   npx tsx scripts/capture-portal-html.ts --portal pisoscom  --city cordoba --listing-pages 3 --detail-limit 2
 *   npx tsx scripts/capture-portal-html.ts --portal milanuncios --city cordoba --headed
 *   npx tsx scripts/capture-portal-html.ts --portal idealista --city cordoba \
 *     --via-web-unlocker --zone web_unlocker_market --listing-pages 3 --detail-limit 0
 *
 * Salida (`data/captures/<portal>/<YYYYMMDD-HHMMSS>/`):
 *   - listing-page-1.html ... listing-page-N.html
 *   - detail-<externalId>.html (hasta --detail-limit)
 *   - meta.json con URLs, status HTTP, decisiones de robots, timing,
 *     y (si Web Unlocker) `blocked` y `blockedReason` por página
 *
 * Política de privacidad: las capturas crudas viven solo en local
 * (`data/captures/` está en .gitignore). Los fixtures que se commitean
 * en `__tests__/fixtures/` deben ser sanitizados manualmente.
 */

import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium as chromiumStandard, type Browser, type BrowserContext, type Page } from "playwright";
// Modo stealth: playwright-extra + plugin de Puppeteer "stealth" portado.
// Solo se usa si la CLI pasa `--stealth` (mucho más lento de arrancar).
import { chromium as chromiumExtra } from "playwright-extra";
// El plugin viene tipado para Puppeteer; lo casteamos al usarlo con
// playwright-extra (compatibilidad documentada en el README oficial).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
import {
  evaluateRobots,
  fetchPortalRobots,
  type RobotsPolicy,
} from "@/lib/scraping/portal-robots";
import { unlockUrl, type UnlockBlockedReason } from "@/lib/scraping/web-unlocker/client";

// ---------------------------------------------------------------------------
// Configuración por portal
// ---------------------------------------------------------------------------

type PortalSlug = "fotocasa" | "pisoscom" | "milanuncios" | "idealista";

interface PortalConfig {
  host: string;
  /** Función que dada (ciudad, página) devuelve la URL del listado. */
  buildListingUrl(city: string, page: number): string;
  /** Regex para encontrar URLs de ficha en el HTML del listado. */
  detailLinkRe: RegExp;
  /** Convierte un href relativo o absoluto en una URL absoluta canonicalizada. */
  toAbsoluteUrl(href: string): string;
  /** Identificador del anuncio extraído de la URL (para nombrar el fichero). */
  extractListingId(absoluteUrl: string): string | null;
  /**
   * Selector CSS que indica "la página de listado ya está hidratada"
   * (las cards client-side están en el DOM). Si null, no se espera selector.
   */
  hydratedSelector: string | null;
  /**
   * Si true, hacer scroll programático para forzar lazy-load tras hydration.
   */
  scrollToBottom: boolean;
}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const PORTALS: Record<PortalSlug, PortalConfig> = {
  fotocasa: {
    host: "www.fotocasa.es",
    buildListingUrl: (city, page) => {
      // Patrón conocido: https://www.fotocasa.es/es/comprar/viviendas/<ciudad>/todas-las-zonas/l[/N]
      const base = `https://www.fotocasa.es/es/comprar/viviendas/${city}-capital/todas-las-zonas/l`;
      return page <= 1 ? base : `${base}/${page}`;
    },
    detailLinkRe: /href="(\/es\/comprar\/vivienda\/[^"\s]+\/d)(?:[^"]*)"/g,
    toAbsoluteUrl: (href) => {
      const url = new URL(href, "https://www.fotocasa.es");
      url.hash = "";
      return url.toString();
    },
    extractListingId: (absoluteUrl) => {
      try {
        const m = new URL(absoluteUrl).pathname.match(/\/(\d{6,})\/d$/);
        return m?.[1] ?? null;
      } catch {
        return null;
      }
    },
    // Fotocasa renderiza las cards client-side. Esperamos a que haya
    // varios links de ficha en el DOM antes de capturar.
    hydratedSelector: 'a[href*="/es/comprar/vivienda/"][href$="/d"]',
    scrollToBottom: true,
  },
  pisoscom: {
    host: "www.pisos.com",
    buildListingUrl: (city, page) => {
      // Patrón verificado contra portal real (06/05/2026):
      //   https://www.pisos.com/venta/pisos-cordoba_capital/
      //   https://www.pisos.com/venta/pisos-cordoba_capital/N/   (paginación)
      const base = `https://www.pisos.com/venta/pisos-${city}_capital/`;
      return page <= 1 ? base : `${base}${page}/`;
    },
    // Patrón real ficha (verificado 06/05/2026):
    //   /comprar/{tipologia}-{slug}-{ID11+}_{ID6+}/
    // El ID estable del anuncio son los 11+ dígitos antes del `_`.
    detailLinkRe:
      /href="(\/comprar\/(?:piso|casa|chalet|adosado|atico|duplex|estudio|loft|garaje|local|oficina|finca|nave|terreno|trastero|edificio|casa_adosada)[^"\s]*-\d{8,}_\d+\/?)(?:[^"]*)"/g,
    toAbsoluteUrl: (href) => {
      const url = new URL(href, "https://www.pisos.com");
      url.hash = "";
      return url.toString();
    },
    extractListingId: (absoluteUrl) => {
      try {
        const trimmed = new URL(absoluteUrl).pathname.replace(/\/$/, "");
        const last = trimmed.split("/").pop() ?? "";
        // Patrón: ...-{ID11+}_{ID6+}
        const m = last.match(/-(\d{8,})_\d+$/);
        return m?.[1] ?? null;
      } catch {
        return null;
      }
    },
    hydratedSelector: 'a[href*="/comprar/"]',
    scrollToBottom: true,
  },
  milanuncios: {
    host: "www.milanuncios.com",
    buildListingUrl: (city, page) => {
      // Patrón conocido: https://www.milanuncios.com/inmuebles/comprar-casas-<ciudad>.htm[?pagina=N]
      const base = `https://www.milanuncios.com/inmuebles/comprar-casas-${city}.htm`;
      return page <= 1 ? base : `${base}?pagina=${page}`;
    },
    detailLinkRe: /href="(\/inmuebles\/[a-z0-9-]+-\d{6,}\.htm)(?:[^"]*)"/g,
    toAbsoluteUrl: (href) => {
      const url = new URL(href, "https://www.milanuncios.com");
      url.hash = "";
      return url.toString();
    },
    extractListingId: (absoluteUrl) => {
      try {
        const m = new URL(absoluteUrl).pathname.match(/-(\d{6,})\.htm$/);
        return m?.[1] ?? null;
      } catch {
        return null;
      }
    },
    hydratedSelector: 'a[href*="/inmuebles/"][href$=".htm"]',
    scrollToBottom: true,
  },
  idealista: {
    host: "www.idealista.com",
    buildListingUrl: (city, page) => {
      // Patrón verificado en producción (lib/idealista/run.ts):
      //   https://www.idealista.com/venta-viviendas/<ciudad>-<provincia>/
      //   .../pagina-N.htm   (paginación)
      // Para Córdoba ciudad/provincia: cordoba-cordoba.
      const slug = city === "cordoba" ? "cordoba-cordoba" : city;
      const base = `https://www.idealista.com/venta-viviendas/${slug}/`;
      return page <= 1 ? base : `${base}pagina-${page}.htm`;
    },
    detailLinkRe: /href="(\/inmueble\/(\d{6,})\/?)(?:[^"]*)"/g,
    toAbsoluteUrl: (href) => {
      const url = new URL(href, "https://www.idealista.com");
      url.hash = "";
      return url.toString();
    },
    extractListingId: (absoluteUrl) => {
      try {
        const m = new URL(absoluteUrl).pathname.match(/\/inmueble\/(\d{6,})\/?$/);
        return m?.[1] ?? null;
      } catch {
        return null;
      }
    },
    hydratedSelector: 'a[href*="/inmueble/"]',
    // Idealista no necesita scroll para el listado (las cards vienen en
    // el HTML inicial). Sí ejecuta JS para hydration, pero domcontentloaded
    // suele bastar contra Web Unlocker (HTML estático).
    scrollToBottom: false,
  },
};

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface CliOptions {
  portal: PortalSlug;
  city: string;
  listingPages: number;
  detailLimit: number;
  output: string;
  politeDelayMs: number;
  headless: boolean;
  allowUnverifiedRobots: boolean;
  timeoutMs: number;
  stealth: boolean;
  /** Si true, se usa Bright Data Web Unlocker en lugar de Playwright local. */
  viaWebUnlocker: boolean;
  /** Zona del Web Unlocker (obligatoria si `viaWebUnlocker=true`). */
  unlockerZone: string | null;
  /** País preferido del Web Unlocker (default: es). */
  unlockerCountry: string;
  /** URL semilla custom (override de `buildListingUrl`). */
  seedUrl: string | null;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    portal: "fotocasa",
    city: "cordoba",
    listingPages: 3,
    detailLimit: 2,
    output: "data/captures",
    politeDelayMs: 3_000,
    headless: true,
    allowUnverifiedRobots: false,
    timeoutMs: 45_000,
    stealth: false,
    viaWebUnlocker: false,
    unlockerZone: null,
    unlockerCountry: "es",
    seedUrl: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--portal" && next) {
      if (next !== "fotocasa" && next !== "pisoscom" && next !== "milanuncios" && next !== "idealista") {
        throw new Error(`--portal debe ser fotocasa | pisoscom | milanuncios | idealista (recibido: ${next})`);
      }
      opts.portal = next;
      i++;
    } else if (arg === "--city" && next) {
      opts.city = next;
      i++;
    } else if (arg === "--listing-pages" && next) {
      opts.listingPages = Math.max(1, Number(next));
      i++;
    } else if (arg === "--detail-limit" && next) {
      opts.detailLimit = Math.max(0, Number(next));
      i++;
    } else if (arg === "--output" && next) {
      opts.output = next;
      i++;
    } else if (arg === "--polite-delay" && next) {
      opts.politeDelayMs = Math.max(0, Number(next));
      i++;
    } else if (arg === "--timeout" && next) {
      opts.timeoutMs = Math.max(5_000, Number(next));
      i++;
    } else if (arg === "--headed") {
      opts.headless = false;
    } else if (arg === "--headless") {
      opts.headless = true;
    } else if (arg === "--allow-unverified-robots") {
      opts.allowUnverifiedRobots = true;
    } else if (arg === "--stealth") {
      opts.stealth = true;
    } else if (arg === "--via-web-unlocker") {
      opts.viaWebUnlocker = true;
    } else if (arg === "--zone" && next) {
      opts.unlockerZone = next;
      i++;
    } else if (arg === "--country" && next) {
      opts.unlockerCountry = next;
      i++;
    } else if (arg === "--seed-url" && next) {
      opts.seedUrl = next;
      i++;
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Argumento no reconocido: ${arg}`);
    }
  }
  if (opts.viaWebUnlocker) {
    if (!opts.unlockerZone) {
      throw new Error("--via-web-unlocker requiere --zone <zone>");
    }
    if (!process.env.BRIGHTDATA_API_TOKEN?.trim()) {
      throw new Error("--via-web-unlocker requiere BRIGHTDATA_API_TOKEN en el entorno");
    }
  }
  return opts;
}

function printUsage(): void {
  console.log(
    [
      "capture-portal-html — captura HTML real para calibrar parsers.",
      "",
      "Opciones:",
      "  --portal <fotocasa|pisoscom|milanuncios|idealista>  (default: fotocasa)",
      "  --city <slug>                              (default: cordoba)",
      "  --listing-pages <N>                        (default: 3)",
      "  --detail-limit <N>                         (default: 2)",
      "  --output <dir>                             (default: data/captures)",
      "  --polite-delay <ms>                        (default: 3000)",
      "  --timeout <ms>                             (default: 45000)",
      "  --headed                                   abrir navegador visible",
      "  --allow-unverified-robots                  no abortar si robots.txt da error",
      "  --stealth                                  usar playwright-extra + stealth plugin (anti-bot)",
      "  --via-web-unlocker                         usar Bright Data Web Unlocker REST (anti DataDome)",
      "  --zone <zone>                              zona del Web Unlocker (req. con --via-web-unlocker)",
      "  --country <iso2>                           país del Web Unlocker (default: es)",
      "  --seed-url <url>                           override de la URL semilla",
    ].join("\n"),
  );
}

// ---------------------------------------------------------------------------
// Helpers de captura
// ---------------------------------------------------------------------------

interface PageCapture {
  pageUrl: string;
  httpStatus: number | null;
  filePath: string;
  bytes: number;
  capturedAt: string;
}

interface CaptureMeta {
  portal: PortalSlug;
  city: string;
  via: "playwright" | "web-unlocker";
  startedAt: string;
  finishedAt: string;
  listingPages: Array<PageCapture & { blocked?: boolean; blockedReason?: UnlockBlockedReason | null }>;
  details: Array<PageCapture & { externalId: string | null; blocked?: boolean; blockedReason?: UnlockBlockedReason | null }>;
  robotsAllowed: Array<{ url: string; allowed: boolean; matchedRule?: string }>;
  errors: Array<{ url: string; error: string }>;
}

function timestampDir(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
  );
}

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Singleton de plugin para no instalarlo en cada llamada (idempotente, pero
// evita el log de "plugin already registered").
let stealthPluginInstalled = false;

async function createBrowser(args: { headless: boolean; stealth: boolean }): Promise<{
  browser: Browser;
  context: BrowserContext;
  page: Page;
}> {
  const launcher = args.stealth ? chromiumExtra : chromiumStandard;
  if (args.stealth && !stealthPluginInstalled) {
    chromiumExtra.use(StealthPlugin());
    stealthPluginInstalled = true;
    console.log("[capture] modo stealth activo (playwright-extra + stealth plugin)");
  }
  const browser = await launcher.launch({ headless: args.headless });
  const context = await browser.newContext({
    locale: "es-ES",
    timezoneId: "Europe/Madrid",
    viewport: { width: 1366, height: 900 },
    userAgent: USER_AGENT,
    extraHTTPHeaders: {
      "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    },
  });
  context.setDefaultTimeout(45_000);
  const page = await context.newPage();
  return { browser, context, page };
}

async function acceptCookieBanner(page: Page): Promise<void> {
  for (const label of [/aceptar/i, /acepto/i, /accept/i, /vale/i, /continuar/i]) {
    const btn = page.getByRole("button", { name: label }).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ timeout: 2_500 }).catch(() => undefined);
      return;
    }
  }
}

async function navigateAndCapture(args: {
  page: Page;
  url: string;
  outDir: string;
  filename: string;
  timeoutMs: number;
  hydratedSelector: string | null;
  scrollToBottom: boolean;
}): Promise<PageCapture> {
  const response = await args.page.goto(args.url, {
    waitUntil: "domcontentloaded",
    timeout: args.timeoutMs,
  });
  await acceptCookieBanner(args.page);
  await args.page
    .waitForLoadState("networkidle", { timeout: 25_000 })
    .catch(() => undefined);

  if (args.hydratedSelector) {
    await args.page
      .waitForSelector(args.hydratedSelector, { timeout: 20_000, state: "attached" })
      .catch(() => undefined);
  }

  if (args.scrollToBottom) {
    await scrollPageToBottom(args.page);
    // Tras el scroll, dar tiempo al lazy-load.
    await args.page
      .waitForLoadState("networkidle", { timeout: 10_000 })
      .catch(() => undefined);
  }

  const html = await args.page.content();
  const filePath = join(args.outDir, args.filename);
  await writeFile(filePath, html, "utf-8");
  return {
    pageUrl: args.url,
    httpStatus: response?.status() ?? null,
    filePath,
    bytes: Buffer.byteLength(html, "utf-8"),
    capturedAt: new Date().toISOString(),
  };
}

async function scrollPageToBottom(page: Page): Promise<void> {
  // Scroll progresivo en pasos para activar IntersectionObserver / lazy-load.
  await page
    .evaluate(async () => {
      const distance = 800;
      const delay = 350;
      const maxScrolls = 25;
      for (let i = 0; i < maxScrolls; i++) {
        const prev = document.documentElement.scrollHeight;
        window.scrollBy(0, distance);
        await new Promise((r) => setTimeout(r, delay));
        const curr = document.documentElement.scrollHeight;
        // Si llegamos al fondo y la altura no creció en los últimos 2 ciclos,
        // damos por terminado el scroll.
        if (window.innerHeight + window.scrollY >= curr - 50 && curr === prev) {
          break;
        }
      }
      // Volver arriba para que el HTML capturado refleje el estado completo.
      window.scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 300));
    })
    .catch(() => undefined);
}

function extractDetailUrls(
  html: string,
  config: PortalConfig,
  limit: number,
): string[] {
  const re = new RegExp(config.detailLinkRe.source, config.detailLinkRe.flags);
  const out = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) != null && out.size < limit * 4) {
    const href = match[1];
    if (!href) continue;
    out.add(config.toAbsoluteUrl(href));
  }
  return [...out].slice(0, limit);
}

// ---------------------------------------------------------------------------
// Captura via Web Unlocker (Bright Data REST, sin browser)
// ---------------------------------------------------------------------------

async function captureViaWebUnlocker(args: {
  url: string;
  outDir: string;
  filename: string;
  zone: string;
  country: string;
  apiToken: string;
  timeoutMs: number;
}): Promise<PageCapture & { blocked: boolean; blockedReason: UnlockBlockedReason | null; html: string }> {
  const startedAt = new Date().toISOString();
  const outcome = await unlockUrl({
    url: args.url,
    zone: args.zone,
    apiToken: args.apiToken,
    country: args.country,
    timeoutMs: args.timeoutMs,
    format: "raw",
  });

  if (!outcome.ok) {
    throw new Error(
      `Web Unlocker error status=${outcome.status ?? "?"} code=${outcome.errorCode ?? "?"}: ${outcome.errorMessage}`,
    );
  }

  const html = outcome.html;
  const filePath = join(args.outDir, args.filename);
  await writeFile(filePath, html, "utf-8");
  return {
    pageUrl: args.url,
    httpStatus: outcome.status,
    filePath,
    bytes: Buffer.byteLength(html, "utf-8"),
    capturedAt: startedAt,
    blocked: Boolean(outcome.blocked),
    blockedReason: outcome.blockedReason ?? null,
    html,
  };
}

async function runWebUnlockerMain(opts: CliOptions): Promise<void> {
  const config = PORTALS[opts.portal];
  const apiToken = process.env.BRIGHTDATA_API_TOKEN!.trim();
  const zone = opts.unlockerZone!;
  const outDir = join(opts.output, opts.portal, `${timestampDir()}-unlocker`);
  await ensureDir(outDir);

  console.log(
    `[capture] portal=${opts.portal} city=${opts.city} via=web-unlocker zone=${zone} -> ${outDir}`,
  );

  // Robots.txt: misma política que en modo Playwright. Ojo: con Idealista,
  // robots.txt prohíbe el rastreo masivo. Al ser una captura puntual de
  // calibración, se documenta y se permite con --allow-unverified-robots.
  let policy: RobotsPolicy;
  try {
    policy = await fetchPortalRobots({
      host: config.host,
      userAgent: USER_AGENT,
      allowUnverified: opts.allowUnverifiedRobots,
    });
    console.log(
      `[capture] robots.txt: verified=${policy.verified} rules=${policy.rules.length}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[capture] no se pudo leer robots.txt: ${msg}`);
    console.error(`          Reintenta con --allow-unverified-robots si quieres continuar igualmente.`);
    process.exit(2);
  }

  const meta: CaptureMeta = {
    portal: opts.portal,
    city: opts.city,
    via: "web-unlocker",
    startedAt: new Date().toISOString(),
    finishedAt: "",
    listingPages: [],
    details: [],
    robotsAllowed: [],
    errors: [],
  };

  let lastListingHtml: string | null = null;
  for (let p = 1; p <= opts.listingPages; p++) {
    const url = opts.seedUrl && p === 1 ? opts.seedUrl : config.buildListingUrl(opts.city, p);
    const decision = evaluateRobots(policy, url);
    meta.robotsAllowed.push({ url, allowed: decision.allowed, matchedRule: decision.matchedRule });
    if (!decision.allowed && !opts.allowUnverifiedRobots) {
      const reason = `robots.txt prohíbe ${url} (regla=${decision.matchedRule})`;
      console.warn(`[capture] saltando: ${reason}`);
      meta.errors.push({ url, error: reason });
      continue;
    }

    console.log(`[capture] listing page ${p}: ${url}`);
    try {
      const cap = await captureViaWebUnlocker({
        url,
        outDir,
        filename: `listing-page-${p}.html`,
        zone,
        country: opts.unlockerCountry,
        apiToken,
        timeoutMs: opts.timeoutMs,
      });
      const { html, ...metaCap } = cap;
      meta.listingPages.push(metaCap);
      console.log(
        `           OK status=${cap.httpStatus} bytes=${cap.bytes.toLocaleString("es-ES")}` +
          (cap.blocked ? ` BLOCKED reason=${cap.blockedReason}` : ""),
      );
      if (!cap.blocked && (lastListingHtml == null || html.length > lastListingHtml.length)) {
        lastListingHtml = html;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`           ERROR: ${msg}`);
      meta.errors.push({ url, error: msg });
    }
    await sleep(opts.politeDelayMs);
  }

  // Detalles
  if (opts.detailLimit > 0 && lastListingHtml) {
    const detailUrls = extractDetailUrls(lastListingHtml, config, opts.detailLimit);
    console.log(`[capture] detalles candidatos: ${detailUrls.length}`);
    for (const detailUrl of detailUrls) {
      const decision = evaluateRobots(policy, detailUrl);
      meta.robotsAllowed.push({
        url: detailUrl,
        allowed: decision.allowed,
        matchedRule: decision.matchedRule,
      });
      if (!decision.allowed && !opts.allowUnverifiedRobots) {
        console.warn(`[capture] saltando ficha: robots prohíbe ${detailUrl}`);
        meta.errors.push({ url: detailUrl, error: `robots disallow (${decision.matchedRule})` });
        continue;
      }
      const externalId = config.extractListingId(detailUrl);
      const filename = externalId
        ? `detail-${externalId}.html`
        : `detail-${meta.details.length + 1}.html`;
      console.log(`[capture] detail ${externalId ?? "?"}: ${detailUrl}`);
      try {
        const cap = await captureViaWebUnlocker({
          url: detailUrl,
          outDir,
          filename,
          zone,
          country: opts.unlockerCountry,
          apiToken,
          timeoutMs: opts.timeoutMs,
        });
        // Excluimos `html` del meta json (ya lo escribimos al disco).
        const { html: _ignored, ...metaCap } = cap;
        void _ignored;
        meta.details.push({ ...metaCap, externalId });
        console.log(
          `           OK status=${cap.httpStatus} bytes=${cap.bytes.toLocaleString("es-ES")}` +
            (cap.blocked ? ` BLOCKED reason=${cap.blockedReason}` : ""),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`           ERROR: ${msg}`);
        meta.errors.push({ url: detailUrl, error: msg });
      }
      await sleep(opts.politeDelayMs);
    }
  }

  meta.finishedAt = new Date().toISOString();
  await writeFile(join(outDir, "meta.json"), JSON.stringify(meta, null, 2), "utf-8");

  console.log("");
  console.log(`[capture] resumen:`);
  console.log(`  via:           web-unlocker`);
  console.log(`  listings ok:   ${meta.listingPages.length}/${opts.listingPages}`);
  console.log(`  blocked:       ${meta.listingPages.filter((p) => p.blocked).length}`);
  console.log(`  details ok:    ${meta.details.length}/${opts.detailLimit}`);
  console.log(`  errors:        ${meta.errors.length}`);
  console.log(`  output:        ${outDir}`);

  if (meta.listingPages.length === 0) {
    console.error("[capture] FALLO: no se capturó ninguna página de listado.");
    process.exit(3);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  // Rama Web Unlocker (Bright Data REST). Recomendado para Idealista.
  // No abre Playwright; sólo HTTP autenticado contra api.brightdata.com.
  if (opts.viaWebUnlocker) {
    await runWebUnlockerMain(opts);
    return;
  }

  const config = PORTALS[opts.portal];

  const outDir = join(opts.output, opts.portal, timestampDir());
  await ensureDir(outDir);

  console.log(`[capture] portal=${opts.portal} city=${opts.city} -> ${outDir}`);

  // 1) Robots.txt
  let policy: RobotsPolicy;
  try {
    policy = await fetchPortalRobots({
      host: config.host,
      userAgent: USER_AGENT,
      allowUnverified: opts.allowUnverifiedRobots,
    });
    console.log(
      `[capture] robots.txt: verified=${policy.verified} rules=${policy.rules.length}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[capture] no se pudo leer robots.txt: ${msg}`);
    console.error(`          Reintenta con --allow-unverified-robots si quieres continuar igualmente.`);
    process.exit(2);
  }

  const meta: CaptureMeta = {
    portal: opts.portal,
    city: opts.city,
    startedAt: new Date().toISOString(),
    finishedAt: "",
    listingPages: [],
    details: [],
    robotsAllowed: [],
    errors: [],
  };

  const { browser, context, page } = await createBrowser({
    headless: opts.headless,
    stealth: opts.stealth,
  });
  try {
    // 2) Listados
    let lastListingHtml: string | null = null;
    for (let p = 1; p <= opts.listingPages; p++) {
      const url = config.buildListingUrl(opts.city, p);
      const decision = evaluateRobots(policy, url);
      meta.robotsAllowed.push({
        url,
        allowed: decision.allowed,
        matchedRule: decision.matchedRule,
      });
      if (!decision.allowed) {
        const reason = `robots.txt prohíbe ${url} (regla=${decision.matchedRule})`;
        console.warn(`[capture] saltando: ${reason}`);
        meta.errors.push({ url, error: reason });
        continue;
      }

      console.log(`[capture] listing page ${p}: ${url}`);
      try {
        const cap = await navigateAndCapture({
          page,
          url,
          outDir,
          filename: `listing-page-${p}.html`,
          timeoutMs: opts.timeoutMs,
          hydratedSelector: config.hydratedSelector,
          scrollToBottom: config.scrollToBottom,
        });
        meta.listingPages.push(cap);
        console.log(
          `           OK status=${cap.httpStatus} bytes=${cap.bytes.toLocaleString("es-ES")}`,
        );
        // Preservamos el HTML de la página de listado más "rica" para
        // extraer detalles. Si una página posterior viene en 4xx/5xx
        // (bloqueo), el HTML será corto: nos quedamos con el más grande
        // de los exitosos.
        const html = await page.content();
        const isProbablyBlocked =
          (cap.httpStatus !== null && cap.httpStatus >= 400) ||
          html.length < 50_000;
        if (!isProbablyBlocked && (lastListingHtml == null || html.length > lastListingHtml.length)) {
          lastListingHtml = html;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`           ERROR: ${msg}`);
        meta.errors.push({ url, error: msg });
      }
      await sleep(opts.politeDelayMs);
    }

    // 3) Detalles (extraídos de la última página exitosa de listado)
    if (opts.detailLimit > 0 && lastListingHtml) {
      const detailUrls = extractDetailUrls(lastListingHtml, config, opts.detailLimit);
      console.log(`[capture] detalles candidatos: ${detailUrls.length}`);
      for (const detailUrl of detailUrls) {
        const decision = evaluateRobots(policy, detailUrl);
        meta.robotsAllowed.push({
          url: detailUrl,
          allowed: decision.allowed,
          matchedRule: decision.matchedRule,
        });
        if (!decision.allowed) {
          console.warn(`[capture] saltando ficha: robots prohíbe ${detailUrl}`);
          meta.errors.push({
            url: detailUrl,
            error: `robots disallow (${decision.matchedRule})`,
          });
          continue;
        }
        const externalId = config.extractListingId(detailUrl);
        const filename = externalId
          ? `detail-${externalId}.html`
          : `detail-${meta.details.length + 1}.html`;
        console.log(`[capture] detail ${externalId ?? "?"}: ${detailUrl}`);
        try {
          const cap = await navigateAndCapture({
            page,
            url: detailUrl,
            outDir,
            filename,
            timeoutMs: opts.timeoutMs,
            // Para fichas de detalle no hace falta esperar selector ni scroll;
            // el HTML útil suele estar listo tras networkidle.
            hydratedSelector: null,
            scrollToBottom: false,
          });
          meta.details.push({ ...cap, externalId });
          console.log(
            `           OK status=${cap.httpStatus} bytes=${cap.bytes.toLocaleString("es-ES")}`,
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`           ERROR: ${msg}`);
          meta.errors.push({ url: detailUrl, error: msg });
        }
        await sleep(opts.politeDelayMs);
      }
    }

    meta.finishedAt = new Date().toISOString();
    await writeFile(join(outDir, "meta.json"), JSON.stringify(meta, null, 2), "utf-8");

    console.log("");
    console.log(`[capture] resumen:`);
    console.log(`  listings ok:   ${meta.listingPages.length}/${opts.listingPages}`);
    console.log(`  details ok:    ${meta.details.length}/${opts.detailLimit}`);
    console.log(`  errors:        ${meta.errors.length}`);
    console.log(`  output:        ${outDir}`);

    if (meta.listingPages.length === 0) {
      console.error("[capture] FALLO: no se capturó ninguna página de listado.");
      process.exit(3);
    }
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error("[capture] fallo fatal:", err);
  process.exit(99);
});
