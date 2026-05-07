/**
 * Capture interactivo de detalle de Fotocasa.
 *
 * Flujo:
 *  1. Aceptar el banner de cookies si esta visible (Didomi en mayo 2026).
 *  2. (opcional) Expandir descripcion completa si la version truncada esta visible.
 *  3. Hacer click en "Ver telefono". Fotocasa expone el numero por dos vias
 *     equivalentes:
 *       - JSON inline de Next.js (`__NEXT_DATA__.props.pageProps.initialProps.realEstate.contactInfo.phone`).
 *         Cuando aparece YA en el HTML inicial el click es opcional.
 *       - Endpoint AJAX `POST /api/realestates/<id>/phone` o equivalente
 *         que devuelve `{phoneNumber, formattedPhoneNumber}`. Tras click,
 *         el DOM se rehydra con el numero visible.
 *  4. Esperar networkidle + un waitForTimeout corto para que el DOM
 *     incorpore la respuesta.
 *  5. Re-leer el HTML y delegar al parser.
 *
 * Si Bright Data no esta disponible (modo direct-browser) el detail vendra
 * bloqueado por PerimeterX y `parseFotocasaDetail` devuelve estructura
 * vacia (vease `isFotocasaBlocked`).
 *
 * Ver scripts/calibrate-portal-detail.ts y docs/portal-html-analysis.md.
 */
import type { Page } from "playwright";
import {
  parseFotocasaDetail,
  type ParsedDetail,
} from "../../../../../lib/workers/market-worker/detail";

export interface FotocasaDetailCaptureResult extends ParsedDetail {
  clickedRevealPhone: boolean;
  /** Telefono devuelto por el endpoint AJAX si aplica (capturado para debugging). */
  ajaxPhonePayload: string | null;
}

const COOKIE_ACCEPT_SELECTORS = [
  "#didomi-notice-agree-button",
  "button#onetrust-accept-btn-handler",
  "button[aria-label*='Aceptar' i]",
  "button[aria-label*='Accept' i]",
];

const REVEAL_SELECTORS = [
  // data-testid del react-cms (Adevinta Fotocasa).
  "[data-testid='see-phone']",
  "[data-test='see-phone']",
  "[data-testid='reveal-phone']",
  "[data-testid='ContactPhone-show']",
  "button[data-testid*='phone' i]",
  // Clases conocidas (re-ContactDetail-*).
  "button.re-ContactDetail-phoneButton",
  "a.re-ContactDetail-phoneButton",
  ".re-ContactDetail-callButton",
  ".re-Phone-button",
  ".re-ContactDetail-phone",
  // Aria/role generico.
  "[class*='Phone'] button",
  "button[aria-label*='telefono' i]",
  "button[aria-label*='tel\u00e9fono' i]",
];

const REVEAL_TEXTS = [
  /^ver tel[eé]fono$/i,
  /mostrar tel[eé]fono/i,
  /^ver n[uú]mero$/i,
  /llamar/i,
];

const SHOW_FULL_DESCRIPTION_SELECTORS = [
  "[data-testid='read-more']",
  "[data-testid='ShowMore']",
  ".re-DetailDescription-readMore",
  "button[aria-label*='mas' i]",
  "button[aria-label*='m\u00e1s' i]",
];

const PHONE_AJAX_REGEX = /\/api\/(?:realestates?|contact|phone|ad)\/[^\s]*phone/i;

export async function captureFotocasaDetail(
  page: Page,
  beforeHtml: string,
): Promise<FotocasaDetailCaptureResult> {
  // 1) Cookie banner: si lo dejamos cubre el boton "Ver telefono" en algunos
  // viewports pequenos.
  await tryClickAny(page, COOKIE_ACCEPT_SELECTORS, []);

  // 2) Expandir descripcion truncada si aplica (no obligatorio: el parser
  // tambien lee de __NEXT_DATA__).
  await tryClickAny(page, SHOW_FULL_DESCRIPTION_SELECTORS, []);

  // 3) Pre-arrancar la promesa de respuesta AJAX ANTES del click. Si
  // Fotocasa no llama a este endpoint, la promesa se rechaza por timeout
  // pero el numero sigue disponible en el DOM o en __NEXT_DATA__.
  const phonePayloadPromise = page
    .waitForResponse(
      (resp) => PHONE_AJAX_REGEX.test(resp.url()) && resp.status() < 400,
      { timeout: 8_000 },
    )
    .catch(() => null);

  // 4) Click en "Ver telefono".
  const clicked = await tryClickAny(page, REVEAL_SELECTORS, REVEAL_TEXTS);

  let ajaxPhonePayload: string | null = null;
  if (clicked) {
    const resp = await phonePayloadPromise;
    if (resp) {
      ajaxPhonePayload = await resp.text().catch(() => null);
    }
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
    await page.waitForTimeout(800);
  } else {
    // Si NO clickamos (boton no visible o ya revelado): cancelamos la
    // promesa colgada para no perder tiempo esperando.
    void phonePayloadPromise;
  }

  // 5) Re-leer DOM y parsear. Si el AJAX trajo telefono que el DOM no
  // refleja, lo inyectamos como fallback al parser via JSON in-memory.
  const afterHtml = await page.content();
  const parsed = parseFotocasaDetail(afterHtml);

  // Merge: si el parser no encontro phones pero el AJAX si, anadirlos.
  let phones = parsed.phones;
  if (phones.length === 0 && ajaxPhonePayload) {
    const ajaxPhones = extractPhonesFromAjaxPayload(ajaxPhonePayload);
    if (ajaxPhones.length > 0) phones = ajaxPhones;
  }

  return {
    ...parsed,
    phones,
    clickedRevealPhone: clicked,
    description: parsed.description ?? extractInlineDescription(beforeHtml),
    ajaxPhonePayload,
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

function extractInlineDescription(html: string): string | null {
  const m = html.match(/"description"\s*:\s*"((?:[^"\\]|\\.)+)"/);
  if (!m?.[1]) return null;
  return m[1].replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\\//g, "/").trim();
}

/**
 * Parsea telefonos desde el payload AJAX de Fotocasa. La estructura
 * exacta no esta verificada (requiere captura real); cubrimos los
 * patrones mas comunes.
 */
function extractPhonesFromAjaxPayload(body: string): string[] {
  const out = new Set<string>();
  const tryRegexes = [
    /"phoneNumber"\s*:\s*"([^"{}]+)"/g,
    /"formattedPhoneNumber"\s*:\s*"([^"{}]+)"/g,
    /"phone"\s*:\s*"([^"{}]+)"/g,
  ];
  for (const re of tryRegexes) {
    for (const m of body.matchAll(re)) {
      if (m[1]) out.add(m[1]);
    }
  }
  return [...out];
}
