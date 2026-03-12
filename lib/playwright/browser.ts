import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

const DEFAULT_TIMEOUT_MS = 60_000;
const VIEWPORT = { width: 1280, height: 800 };

type BrowserKit = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
};

export async function createBrowser(headless = false): Promise<BrowserKit> {
  const browser = await chromium.launch({ headless });

  const context = await browser.newContext({
    viewport: VIEWPORT,
    locale: "es-ES",
  });
  context.setDefaultTimeout(DEFAULT_TIMEOUT_MS);

  const page = await context.newPage();

  return { browser, context, page };
}
