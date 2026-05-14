/**
 * Capture interactivo de detalle de Pisos.com.
 *
 * Pisos.com expone el telefono tras click en `.contact-phone-btn` o
 * `[data-action="show-phone"]`. La descripcion completa esta en el HTML
 * inicial (no truncada) en la mayoria de casos.
 *
 * Ver scripts/calibrate-portal-detail.ts y docs/portal-html-analysis.md.
 */
import type { Page } from "playwright";
import {
  parsePisoscomDetail,
  type ParsedDetail,
} from "../../../../../lib/workers/market-worker/detail";

export interface PisoscomDetailCaptureResult extends ParsedDetail {
  clickedRevealPhone: boolean;
}

const REVEAL_SELECTORS = [
  ".contact-phone-btn",
  "[data-action='show-phone']",
  "button.show-phone",
  "[class*='phone'] button",
  "a[href*='telefono']",
  "button[aria-label*='telefono' i]",
];

const REVEAL_TEXTS = [/^ver tel[eé]fono$/i, /mostrar tel[eé]fono/i];

export async function capturePisoscomDetail(
  page: Page,
  _beforeHtml: string,
): Promise<PisoscomDetailCaptureResult> {
  const clicked = await tryClickAny(page, REVEAL_SELECTORS, REVEAL_TEXTS);
  if (clicked) {
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
    await page.waitForTimeout(800);
  }

  const afterHtml = await page.content();
  const parsed = parsePisoscomDetail(afterHtml);

  return {
    ...parsed,
    clickedRevealPhone: clicked,
  };
}

async function tryClickAny(page: Page, selectors: string[], texts: RegExp[]): Promise<boolean> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) {
      await locator.scrollIntoViewIfNeeded().catch(() => undefined);
      const ok = await locator
        .click({ timeout: 3_000 })
        .then(() => true)
        .catch(() => false);
      if (ok) return true;
    }
  }
  for (const text of texts) {
    const locator = page.getByText(text).first();
    if (await locator.isVisible().catch(() => false)) {
      await locator.scrollIntoViewIfNeeded().catch(() => undefined);
      const ok = await locator
        .click({ timeout: 3_000 })
        .then(() => true)
        .catch(() => false);
      if (ok) return true;
    }
  }
  return false;
}
