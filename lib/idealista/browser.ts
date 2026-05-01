import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { IDEALISTA_USER_AGENT } from "./config";

type IdealistaBrowserKit = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
};

export async function createIdealistaBrowser(
  headless: boolean,
  storageStatePath?: string,
): Promise<IdealistaBrowserKit> {
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    locale: "es-ES",
    timezoneId: "Europe/Madrid",
    viewport: { width: 1366, height: 900 },
    userAgent: IDEALISTA_USER_AGENT,
    ...(storageStatePath ? { storageState: storageStatePath } : {}),
    extraHTTPHeaders: {
      "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    },
  });

  context.setDefaultTimeout(45_000);
  const page = await context.newPage();
  return { browser, context, page };
}

export async function acceptCookieBannerIfPresent(page: Page): Promise<void> {
  const labels = [/aceptar/i, /acepto/i, /accept/i, /vale/i, /continuar/i];
  for (const label of labels) {
    const button = page.getByRole("button", { name: label }).first();
    if (!(await button.isVisible().catch(() => false))) continue;
    await button.click({ timeout: 2_500 }).catch(() => undefined);
    return;
  }
}

export function buildIdealistaAccessBlockMessage(url: string, pageText: string): string | undefined {
  const normalized = pageText.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const isMisuseBlock =
    /uso indebido/i.test(normalized) ||
    /acceso se ha bloqueado/i.test(normalized) ||
    /access denied|forbidden|captcha|robot/i.test(normalized);

  if (!isMisuseBlock) return undefined;

  const blockId = pageText.match(/\bID:\s*([^\n\r]+)/i)?.[1]?.trim();
  const blockedIp = pageText.match(/\bIP:\s*([^\n\r]+)/i)?.[1]?.trim();
  const details = [
    blockId ? `ID de bloqueo: ${blockId}` : undefined,
    blockedIp ? `IP bloqueada: ${blockedIp}` : undefined,
  ].filter(Boolean);

  return (
    `Idealista ha bloqueado el acceso para ${url}. ` +
    (details.length > 0 ? `${details.join(" · ")}. ` : "") +
    "No conviene reintentar scraping desde esta IP: contacta con soporte de Idealista, usa un canal/API autorizada o ejecuta con una sesion/ruta permitida."
  );
}

export async function assertIdealistaPageAccessible(page: Page, url: string): Promise<void> {
  const responseStatus = await page
    .evaluate(() => document?.body?.innerText?.length ?? 0)
    .catch(() => 0);
  const title = await page.title().catch(() => "");
  const body = await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
  const pageText = `${title}\n${body}`;
  const normalized = pageText.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const accessBlockMessage = buildIdealistaAccessBlockMessage(url, pageText);
  if (accessBlockMessage) {
    throw new Error(accessBlockMessage);
  }

  if (responseStatus === 0 || /access denied|forbidden|captcha|robot|idealista\.com\s*$/i.test(normalized)) {
    throw new Error(
      `Idealista bloqueo o no entrego HTML util para ${url}. ` +
        "Desde este entorno se recibio una pagina vacia/403. Usa una sesion autorizada con --storage-state, valida permisos/robots.txt o ejecuta desde una red permitida.",
    );
  }
}

export async function politeDelay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
