import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { FOTOCASA_USER_AGENT } from "./config";

type FotocasaBrowserKit = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
};

export async function createFotocasaBrowser(headless: boolean): Promise<FotocasaBrowserKit> {
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    locale: "es-ES",
    timezoneId: "Europe/Madrid",
    viewport: { width: 1366, height: 900 },
    userAgent: FOTOCASA_USER_AGENT,
  });

  context.setDefaultTimeout(45_000);
  const page = await context.newPage();
  return { browser, context, page };
}

export async function acceptCookieBannerIfPresent(page: Page): Promise<void> {
  const labels = [/aceptar/i, /acepto/i, /accept/i, /permitir/i];
  for (const label of labels) {
    const button = page.getByRole("button", { name: label }).first();
    if (!(await button.isVisible().catch(() => false))) continue;
    await button.click({ timeout: 2_500 }).catch(() => undefined);
    return;
  }
}

export async function politeDelay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function assertFotocasaPageAccessible(page: Page, url: string): Promise<void> {
  const title = await page.title().catch(() => "");
  const body = await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
  const text = `${title}\n${body}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (/SENTIMOS LA INTERRUPCION/i.test(text)) {
    throw new Error(
      `Fotocasa interrumpio la navegacion para ${url}. Posibles causas indicadas por el portal: cookies, sesion, JavaScript, plugin o navegacion fuera de Espana.`,
    );
  }
}
