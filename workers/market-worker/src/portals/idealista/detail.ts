/**
 * Capture interactivo de detalle de Idealista.
 *
 * El bot ya esta en una Page Playwright cargada (via warm-session +
 * residential proxy del chain). Aqui:
 *   1. Detectamos y clickeamos el boton "Ver telefono" (varios selectores
 *      candidatos para tolerar cambios de release).
 *   2. Esperamos a que el AJAX `urlAdContactPhones` resuelva o a que el
 *      DOM mute con el numero.
 *   3. Capturamos el HTML resultante y lo parseamos con
 *      `parseIdealistaDetail` (extrae phones, description, imageUrls,
 *      listingReference, cadastralRef).
 *   4. Si el click no fue posible, intentamos el fallback AJAX directo
 *      (mismo endpoint) usando la cookie de la sesion.
 *
 * Selectores: ver scripts/calibrate-portal-detail.ts y
 * docs/portal-html-analysis.md (seccion "Detalle interactivo").
 */
import type { Page } from "playwright";
import {
  parseIdealistaDetail,
  parsePhonesFromIdealistaPhonesPayload,
  type ParsedDetail,
} from "../../../../../lib/workers/market-worker/detail";

export interface IdealistaDetailCaptureResult extends ParsedDetail {
  clickedRevealPhone: boolean;
}

const REVEAL_SELECTORS = [
  "a[data-markup-name='show-phone']",
  "a.see-phones-btn",
  "button[data-markup-name='show-phone']",
  "[data-markup='see-phones']",
  "a[href*='showphone']",
];

const REVEAL_TEXTS = [/^ver tel[eé]fono$/i, /mostrar tel[eé]fono/i];

const DESCRIPTION_TOGGLE_SELECTORS = [
  "a.expandable-comment-toggle",
  "button.expandable-comment-toggle",
  "[data-markup='see-more-comment']",
];

export async function captureIdealistaDetail(
  page: Page,
  beforeHtml: string,
): Promise<IdealistaDetailCaptureResult> {
  // 1) Expandir descripcion completa si esta truncada.
  await tryClickAny(page, DESCRIPTION_TOGGLE_SELECTORS, []);

  // 2) Click "Ver telefono". Esperamos red estable post-click.
  const clicked = await tryClickAny(page, REVEAL_SELECTORS, REVEAL_TEXTS);

  if (clicked) {
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
    await page.waitForTimeout(800);
  }

  const afterHtml = await page.content();
  const parsed = parseIdealistaDetail(afterHtml);

  // 3) Fallback AJAX cuando el click no expone telefono visible.
  let phones = parsed.phones;
  if (phones.length === 0 && parsed.idealistaAdId && parsed.idealistaPhonesPath) {
    const ajaxPhones = await fetchIdealistaPhonesViaAjax(
      page,
      parsed.idealistaPhonesPath,
      parsed.idealistaAdId,
    );
    if (ajaxPhones.length > 0) phones = ajaxPhones;
  }

  // Si la descripcion sigue truncada (no expandida), intentar leer del JSON inline.
  let description = parsed.description;
  if (!description || description.length < 100) {
    const fallback = beforeHtml.match(/"description"\s*:\s*"((?:[^"\\]|\\.)+)"/)?.[1];
    if (fallback && fallback.length > (description?.length ?? 0)) {
      description = decodeJsonLikeString(fallback);
    }
  }

  return {
    ...parsed,
    phones,
    description,
    clickedRevealPhone: clicked,
  };
}

async function tryClickAny(
  page: Page,
  selectors: string[],
  texts: RegExp[],
): Promise<boolean> {
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

async function fetchIdealistaPhonesViaAjax(
  page: Page,
  phonesPathTemplate: string,
  adId: string,
): Promise<string[]> {
  try {
    const url = phonesPathTemplate.replaceAll("{adId}", adId);
    const absolute = new URL(url, page.url()).toString();
    const response = await page.request.get(absolute, {
      headers: { "X-Requested-With": "XMLHttpRequest" },
      timeout: 8_000,
    });
    if (!response.ok()) return [];
    const body = await response.text();
    return parsePhonesFromIdealistaPhonesPayload(body);
  } catch {
    return [];
  }
}

function decodeJsonLikeString(value: string): string {
  return value
    .replace(/\\"/g, '"')
    .replace(/\\n/g, "\n")
    .replace(/\\\//g, "/")
    .replace(/\s+/g, " ")
    .trim();
}
