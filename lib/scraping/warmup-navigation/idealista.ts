import type { Page, Response } from "playwright";
import type { HumanCursor } from "@/lib/scraping/human-cursor";
import { humanClick, humanScrollPartial } from "@/lib/scraping/human-cursor";

const IDEALISTA_HOME_URL = "https://www.idealista.com/";

async function clickFirstVisibleHomeLink(page: Page, cursor: HumanCursor): Promise<void> {
  const candidates = [
    page.locator('a[href*="/venta-viviendas/"]').first(),
    page.locator('a[href*="/alquiler-viviendas/"]').first(),
    page.getByRole("link", { name: /comprar|alquilar|venta/i }).first(),
  ];
  for (const locator of candidates) {
    if (!(await locator.isVisible({ timeout: 1_000 }).catch(() => false))) continue;
    const clicked = await humanClick(cursor, locator);
    if (clicked) {
      await page.waitForLoadState("domcontentloaded", { timeout: 5_000 }).catch(() => undefined);
      await page.waitForTimeout(600).catch(() => undefined);
      return;
    }
  }
}

export async function politeIdealistaNavigation(
  page: Page,
  cursor: HumanCursor,
  listingUrl: string,
  options: { totalTimeoutMs: number; warmupEnabled: boolean },
): Promise<Response | null> {
  if (options.warmupEnabled) {
    await page.goto(IDEALISTA_HOME_URL, {
      waitUntil: "commit",
      timeout: Math.min(options.totalTimeoutMs, 30_000),
    });
    await page.waitForLoadState("domcontentloaded", { timeout: 8_000 }).catch(() => undefined);
    await humanScrollPartial(cursor, 0.3);
    await clickFirstVisibleHomeLink(page, cursor);
    await humanScrollPartial(cursor, 0.2).catch(() => undefined);
  }

  const response = await page.goto(listingUrl, {
    waitUntil: "commit",
    timeout: options.totalTimeoutMs,
  });
  await page.waitForLoadState("domcontentloaded", { timeout: 8_000 }).catch(() => undefined);
  await humanScrollPartial(cursor, 0.2).catch(() => undefined);
  return response;
}
