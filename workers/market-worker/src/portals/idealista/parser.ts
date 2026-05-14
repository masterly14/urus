/**
 * Parser puro de listados de Idealista.
 *
 * Calibrado contra HTML real capturado el 06/05/2026 via Bright Data
 * Web Unlocker (ver `docs/portal-html-analysis.md` seccion "Idealista" y
 * `__tests__/fixtures/listing-cordoba-pisos.html`).
 *
 * Decisiones de diseno:
 *  - **DOM-only**: Idealista NO expone JSON-LD por anuncio en el listado
 *    (verificado: 0 ocurrencias de `@type`/`@context` en captura real).
 *    Existe `BreadcrumbList` para nav y un script JS interno con todos los
 *    anuncios (`window.__INITIAL_STATE__` o similar) pero su forma cambia
 *    con releases. DOM scraping sobre `<article data-element-id>` es mas
 *    estable.
 *  - **`data-element-id`** del `<article>` es la fuente de verdad para
 *    `externalId`. Coincide siempre con `<a class="item-link" href="/inmueble/<ID>/">`,
 *    pero el atributo data es mas robusto (no depende de la estructura
 *    del path).
 *  - **Una card por `<article>`** que contenga `data-element-id` con valor
 *    numerico. Articulos sin ese atributo son banners, mapas, "Top
 *    publicaciones", etc.: se descartan.
 */

import type { MarketExtractorItem } from "../../../../../lib/workers/market-worker/extractor";
import { computeIdealistaContentHash } from "./content-hash";

const IDEALISTA_HOST = "https://www.idealista.com";

const PRICE_RE = /(\d{1,3}(?:\.\d{3})+|\d{4,9})\s*(?:€|euros?)/i;
const SURFACE_RE = /(\d{1,4})\s*m(?:²|2|\b)/i;
const ROOMS_RE = /(\d{1,2})\s*(?:hab\.?|habs?\.?|habitaciones?|dormitorios?)/i;
const BATHROOMS_RE = /(\d{1,2})\s*(?:baños?|banyos?)/i;
const FLOOR_RE = /\b(planta\s*\d{1,2}[ªºa]?|bajo|[áa]tico|entresuelo|principal)\b/i;

const NOISE_QUERY_KEYS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "ordenado-por",
  "adid",
  "from",
]);

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

export function canonicalizeIdealistaUrl(href: string): string {
  try {
    const url = new URL(href, IDEALISTA_HOST);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (NOISE_QUERY_KEYS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    let out = url.toString();
    if (out.endsWith("/") && url.pathname !== "/" && url.pathname !== "/inmueble/") {
      // Idealista canoniza con trailing slash el path /inmueble/<ID>/
      // pero quitamos cualquier doble slash final por si acaso
    }
    return out;
  } catch {
    return href;
  }
}

export function extractIdealistaListingId(canonicalUrl: string): string | null {
  try {
    const m = new URL(canonicalUrl, IDEALISTA_HOST).pathname.match(/\/inmueble\/(\d{6,})\/?$/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Detección de bloqueo
// ---------------------------------------------------------------------------

export interface BlockDetection {
  blocked: boolean;
  reason?: string;
}

/**
 * Detecta si el HTML corresponde a una página bloqueada por DataDome.
 *
 * Marcadores reales (capturados 06/05/2026 con `curl -A "curl/8.0"`):
 *  - HTTP 403 con body de ~770 bytes con `<title>idealista.com</title>`,
 *    mensaje "Please enable JS and disable any ad blocker", y
 *    script `ct.captcha-delivery.com/c.js`.
 *
 * Atención: páginas normales de listado tambien cargan
 * `dd.idealista.com/tags.js` y `window.ddjskey` como defensa pasiva.
 * Esos NO son señal de bloqueo. La diferencia es el **tamaño del body**:
 *  - Bloqueo: < 5 KB.
 *  - Listado real: > 200 KB (típicamente ~370 KB para Cordoba).
 */
export function detectBlockedPage(html: string): BlockDetection {
  if (!html || html.length < 200) {
    return { blocked: true, reason: "Respuesta vacía o demasiado corta" };
  }
  // Bloqueo "duro" via uso indebido de Idealista.
  if (/hemos detectado un uso (?:indebido|inadecuado)|uso indebido de la aplicaci[oó]n/i.test(html)) {
    return { blocked: true, reason: "Idealista 'uso indebido' detectado" };
  }
  // Página de captcha de DataDome (script `c.js` o `captcha/`).
  // No matchear `dd.idealista.com/tags.js` (defensa pasiva en pag normal).
  if (/(?:ct|geo)\.captcha-delivery\.com\/(?:c\.js|captcha\/)/i.test(html) && html.length < 30_000) {
    return { blocked: true, reason: "DataDome captcha page" };
  }
  // Body chiquitito + var dd con rt:'c' (challenge) y `Please enable JS`.
  if (
    html.length < 10_000 &&
    /please enable js and disable any ad blocker/i.test(html) &&
    /var\s+dd\s*=\s*\{[^}]*['"]rt['"]\s*:\s*['"]c['"]/i.test(html)
  ) {
    return { blocked: true, reason: "DataDome challenge body" };
  }
  // HTML demasiado pequeño y sin marcadores claros de listado real.
  // Una página real debe contener al menos varios `/inmueble/<ID>/`.
  const inmuebleCount = (html.match(/href="\/inmueble\/\d{6,}\/"/g) ?? []).length;
  if (inmuebleCount === 0 && html.length < 100_000) {
    return { blocked: true, reason: `HTML sin enlaces a /inmueble/ (${html.length} bytes)` };
  }
  return { blocked: false };
}

// ---------------------------------------------------------------------------
// Parser principal
// ---------------------------------------------------------------------------

export interface ParsedIdealistaCard {
  externalId: string | null;
  canonicalUrl: string;
  priceRaw: string | null;
  title: string | null;
  addressRaw: string | null;
  rawText: string;
  surfaceRaw: string | null;
  roomsRaw: string | null;
  bathroomsRaw: string | null;
  floor: string | null;
  zoneRaw: string | null;
  agencyName: string | null;
  mainImageUrl: string | null;
  description: string | null;
  /** Latitud canónica (decimal grados). Cuando `addressVisibility=HIDDEN`,
   * Idealista ofrece una coordenada aproximada al bloque, no exacta. */
  lat: number | null;
  /** Longitud canónica (decimal grados). */
  lng: number | null;
}

export interface ParseIdealistaListingResult {
  cards: ParsedIdealistaCard[];
  detectedUrlsCount: number;
}

// ---------------------------------------------------------------------------
// Extracción de coordenadas (Google Static Map URL embebido por anuncio)
// ---------------------------------------------------------------------------

/**
 * Extrae el slice JSON del valor `listingMultimediaCarrousels` haciendo
 * brace-walking que respeta strings y escape `\\`. Devuelve `null` si no
 * se encuentra el marcador o el JSON no esta balanceado.
 */
function extractCarrouselJsonSlice(html: string): string | null {
  const marker = "listingMultimediaCarrousels:";
  const idx = html.indexOf(marker);
  if (idx < 0) return null;
  let pos = idx + marker.length;
  while (pos < html.length && html[pos] !== "{") pos++;
  if (pos >= html.length) return null;
  const start = pos;
  let depth = 0;
  let inString = false;
  let escape = false;
  while (pos < html.length) {
    const ch = html[pos];
    if (escape) {
      escape = false;
    } else if (inString && ch === "\\") {
      escape = true;
    } else if (ch === '"') {
      inString = !inString;
    } else if (!inString) {
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) return html.slice(start, pos + 1);
      }
    }
    pos++;
  }
  return null;
}

/**
 * Extrae lat/lng por anuncio desde el JSON `listingMultimediaCarrousels`
 * embebido en el HTML del listado. La coordenada vive en
 * `<adId>.map.src` como Google Static Map URL `...?center=<lat>%2C<lng>...`.
 *
 * Nota: cuando `addressVisibility=HIDDEN`, la coordenada se desplaza al
 * centro del bloque (no es exacta). Para filtro por polígono a nivel
 * de barrio es suficiente.
 *
 * Si el JSON no parsea o no contiene la clave, devuelve un Map vacío.
 */
export function extractIdealistaListingCoords(
  html: string,
): Map<string, { lat: number; lng: number }> {
  const out = new Map<string, { lat: number; lng: number }>();
  const slice = extractCarrouselJsonSlice(html);
  if (!slice) return out;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(slice);
  } catch {
    return out;
  }
  for (const [adId, value] of Object.entries(parsed)) {
    if (!/^\d{6,}$/.test(adId)) continue;
    const node = value as Record<string, unknown> | null;
    const map = node?.map as Record<string, unknown> | undefined;
    const src = typeof map?.src === "string" ? map.src : null;
    if (!src) continue;
    const m = src.match(/[?&]center=([\d.]+)(?:%2C|,)(-?[\d.]+)/i);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      out.set(adId, { lat, lng });
    }
  }
  return out;
}

/**
 * Match del bloque `<article ... data-element-id="<ID>" ...>...</article>`
 * con todo su contenido. Idealista no anida `<article>` dentro de otros
 * `<article>` en el listado, por lo que este match no captura demasiado.
 */
const ARTICLE_BLOCK_RE =
  /<article\b[^>]*\bdata-element-id="(\d{6,})"[^>]*>([\s\S]*?)<\/article>/g;

export function parseIdealistaListingHtml(html: string): ParseIdealistaListingResult {
  const cards: ParsedIdealistaCard[] = [];
  const seenUrls = new Set<string>();
  const seenIds = new Set<string>();
  const coordsByAdId = extractIdealistaListingCoords(html);

  const re = new RegExp(ARTICLE_BLOCK_RE.source, ARTICLE_BLOCK_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) != null) {
    const externalId = match[1] ?? null;
    const block = match[2] ?? "";
    if (!externalId || !block) continue;
    if (seenIds.has(externalId)) continue;

    const card = extractCardFromArticle(externalId, block);
    if (!card) continue;
    if (seenUrls.has(card.canonicalUrl)) continue;
    seenUrls.add(card.canonicalUrl);
    seenIds.add(externalId);
    const coords = coordsByAdId.get(externalId);
    if (coords) {
      card.lat = coords.lat;
      card.lng = coords.lng;
    }
    cards.push(card);
  }

  return { cards, detectedUrlsCount: seenUrls.size };
}

function extractCardFromArticle(externalId: string, block: string): ParsedIdealistaCard | null {
  // ---- URL canonica + title del item-link ----
  // El orden de atributos en el HTML real (06/05/2026) es:
  //   <a href="/inmueble/<ID>/" role="heading" aria-level="2"
  //      class="item-link " title="Piso en ...">
  // Hacemos el matching independiente del orden: primero localizamos el tag
  // <a ...> que contiene `class="item-link"`, luego extraemos atributos.
  let href = `/inmueble/${externalId}/`;
  let title: string | null = null;
  const itemLinkTagMatch = block.match(
    /<a\b([^>]*\bclass="[^"]*\bitem-link\b[^"]*"[^>]*)>/,
  );
  if (itemLinkTagMatch) {
    const attrs = itemLinkTagMatch[1] ?? "";
    const hrefAttr = attrs.match(/\bhref="([^"]+)"/);
    if (hrefAttr?.[1] && /\/inmueble\/\d{6,}\/?/.test(hrefAttr[1])) {
      href = hrefAttr[1];
    }
    const titleAttr = attrs.match(/\btitle="([^"]+)"/);
    if (titleAttr?.[1]) title = titleAttr[1];
  }
  const canonicalUrl = canonicalizeIdealistaUrl(href);

  // Sanity: el ID del href debe coincidir con data-element-id (si no, hay
  // anidación rara y la card no es fiable).
  const idFromHref = extractIdealistaListingId(canonicalUrl);
  if (idFromHref && idFromHref !== externalId) return null;

  // ---- Precio: <span class="item-price ..."> X.XXX <span class="txt-big">€</span></span> ----
  const priceMatch = block.match(
    /<span[^>]*\bclass="[^"]*\bitem-price\b[^"]*"[^>]*>([\s\S]*?)<\/span>/,
  );
  const priceRaw = priceMatch ? extractPriceFromHtml(priceMatch[1]!) : pickFirstPriceFromBlock(block);

  // ---- Features (m², hab., planta) en `.item-detail-char` ----
  const detailChar = pickFirstDetailCharBlock(block);
  let surfaceRaw: string | null = null;
  let roomsRaw: string | null = null;
  let bathroomsRaw: string | null = null;
  let floor: string | null = null;
  if (detailChar) {
    const text = collapseWhitespace(stripTags(detailChar));
    surfaceRaw = text.match(SURFACE_RE)?.[1] ?? null;
    roomsRaw = text.match(ROOMS_RE)?.[1] ?? null;
    bathroomsRaw = text.match(BATHROOMS_RE)?.[1] ?? null;
    floor = text.match(FLOOR_RE)?.[1] ?? null;
  }

  // ---- Agencia: <picture class="logo-branding"><a title="<NAME>"> ----
  let agencyName: string | null = null;
  const brandingMatch = block.match(
    /<picture[^>]*\bclass="[^"]*\blogo-branding\b[^"]*"[^>]*>([\s\S]*?)<\/picture>/,
  );
  if (brandingMatch) {
    const inner = brandingMatch[1] ?? "";
    const titleAttr = inner.match(/<a[^>]*\btitle="([^"]+)"/);
    if (titleAttr?.[1]) {
      agencyName = collapseWhitespace(titleAttr[1]);
    } else {
      const altAttr = inner.match(/<img[^>]*\balt="([^"]+)"/);
      agencyName = altAttr?.[1] ? collapseWhitespace(altAttr[1]) : null;
    }
  }

  // ---- Imagen principal ----
  let mainImageUrl: string | null = null;
  const imgMatch = block.match(
    /<img[^>]*\bsrc="(https:\/\/img\d+\.idealista\.com\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i,
  );
  if (imgMatch?.[1]) mainImageUrl = imgMatch[1];

  // ---- Descripción ----
  const descMatch = block.match(
    /<div[^>]*\bclass="[^"]*\bitem-description\b[^"]*"[^>]*>([\s\S]*?)<\/div>/,
  );
  const description = descMatch ? collapseWhitespace(stripTags(descMatch[1] ?? "")) : null;

  // ---- Zona: del title del item-link, segmento penúltimo separado por `,` ----
  const zoneRaw = inferZoneFromTitle(title);
  const addressRaw = inferAddressFromTitle(title, zoneRaw);

  // rawText: para QA y para alimentar `qualityScore`.
  const rawText = collapseWhitespace(stripTags(block)).slice(0, 800);

  return {
    externalId,
    canonicalUrl,
    priceRaw,
    title,
    addressRaw,
    rawText,
    surfaceRaw,
    roomsRaw,
    bathroomsRaw,
    floor,
    zoneRaw,
    agencyName,
    mainImageUrl,
    description: description ? description.slice(0, 600) : null,
    lat: null,
    lng: null,
  };
}

function extractPriceFromHtml(snippet: string): string | null {
  const text = collapseWhitespace(stripTags(snippet));
  const m = text.match(PRICE_RE);
  return m ? `${m[1]} €` : null;
}

function pickFirstPriceFromBlock(block: string): string | null {
  const text = collapseWhitespace(stripTags(block));
  const m = text.match(PRICE_RE);
  return m ? `${m[1]} €` : null;
}

function pickFirstDetailCharBlock(block: string): string | null {
  // <div class="item-detail-char ">...</div> — no anidamos otros divs
  // dentro suficientemente complejos para usar regex tolerante.
  const m = block.match(
    /<div[^>]*\bclass="[^"]*\bitem-detail-char\b[^"]*"[^>]*>([\s\S]*?)<\/div>/,
  );
  return m?.[1] ?? null;
}

// Lista de tipos de vivienda + calificadores que aparecen en titulos y zonas
// de Idealista. Cubre casos como "Piso en ...", "Casa en ...", "Casa o
// chalet independiente en ...", "Chalet adosado en ...". El regex se usa
// para 1) extraer addressRaw del title y 2) limpiar zoneRaw cuando el
// listado vuelca el tipo de vivienda dentro del zone.
const HOUSING_TERM =
  "(?:piso|casa|chalet|d[uú]plex|[áa]tico|estudio|loft|vivienda|apartamento|finca|terreno)";
const HOUSING_QUALIFIER =
  "(?:\\s+(?:independiente|adosad[oa]|pareado|unifamiliar|de\\s+pueblo|r[úu]stic[oa]))?";
const TITLE_HOUSING_PREFIX_RE = new RegExp(
  `^(?:${HOUSING_TERM}(?:\\s+(?:o|y)\\s+${HOUSING_TERM})?${HOUSING_QUALIFIER})\\s+en\\s+`,
  "i",
);

function inferZoneFromTitle(title: string | null): string | null {
  if (!title) return null;
  // Patron real observado:
  //   "Piso en Avenida Almogávares, Valdeolleros - Zumbacón - Camping, Córdoba"
  //   "Piso en Avenida Menéndez Pidal, 2, Vistalegre - Parque Cruz - Universidades, Córdoba"
  // Al partir por coma, el penúltimo segmento es la zona.
  const parts = title.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const candidate = cleanupTitleLocationChunk(parts[parts.length - 2]);
    if (candidate && candidate.length >= 3 && candidate.length <= 120) return candidate;
  }
  return null;
}

/**
 * Extrae una dirección aproximada útil para UI desde el title.
 * Patrón típico:
 *   "Piso en Avenida Menéndez Pidal, 2, Vistalegre - Parque Cruz - Universidades, Córdoba"
 * -> "Avenida Menéndez Pidal, 2"
 *
 * Si no podemos aislar calle/portal, devolvemos `null` (evita guardar ruido).
 */
function inferAddressFromTitle(
  title: string | null,
  zoneRaw: string | null,
): string | null {
  if (!title) return null;
  const normalized = collapseWhitespace(title);
  if (!normalized) return null;

  let head = normalized;
  if (zoneRaw && head.includes(`, ${zoneRaw}`)) {
    head = head.replace(`, ${zoneRaw}`, "");
  }
  head = head.replace(/,\s*c[óo]rdoba$/i, "").trim();

  const m = head.match(TITLE_HOUSING_PREFIX_RE);
  if (!m) return null;
  const addr = cleanupTitleLocationChunk(head.slice(m[0].length));
  if (!addr || addr.length < 5) return null;
  return addr;
}

export function cleanupTitleLocationChunk(value: string): string {
  return collapseWhitespace(value).replace(TITLE_HOUSING_PREFIX_RE, "").trim();
}

function stripTags(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ");
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

// Re-export del PRICE_RE para tests externos.
export { PRICE_RE };

// ---------------------------------------------------------------------------
// Conversión a MarketExtractorItem
// ---------------------------------------------------------------------------

export interface ToItemContext {
  cityFromSeed: string;
  defaultZone: string | null;
  httpStatus: number | null;
}

export function cardsToExtractorItems(
  cards: ParsedIdealistaCard[],
  ctx: ToItemContext,
): MarketExtractorItem[] {
  const items: MarketExtractorItem[] = [];
  for (const card of cards) {
    const contentHash = computeIdealistaContentHash({
      externalId: card.externalId,
      canonicalUrl: card.canonicalUrl,
      priceRaw: card.priceRaw,
      title: card.title,
      surfaceRaw: card.surfaceRaw,
      roomsRaw: card.roomsRaw,
      zoneRaw: card.zoneRaw,
    });
    const extras: Record<string, unknown> = {};
    if (card.description) extras.description = card.description;
    items.push({
      externalId: card.externalId,
      canonicalUrl: card.canonicalUrl,
      contentHash,
      httpStatus: ctx.httpStatus,
      payload: {
        title: card.title ?? undefined,
        addressRaw: card.addressRaw ?? undefined,
        url: card.canonicalUrl,
        rawText: card.rawText,
        priceRaw: card.priceRaw ?? undefined,
        surfaceRaw: card.surfaceRaw ?? undefined,
        roomsRaw: card.roomsRaw ?? undefined,
        bathroomsRaw: card.bathroomsRaw ?? undefined,
        floorRaw: card.floor ?? undefined,
        cityRaw: ctx.cityFromSeed,
        zoneRaw: card.zoneRaw ?? ctx.defaultZone ?? undefined,
        operationRaw: "venta",
        housingRaw: "vivienda",
        advertiserName: card.agencyName ?? undefined,
        advertiserType: card.agencyName ? "agency" : "particular",
        mainImageUrl: card.mainImageUrl ?? undefined,
        imageUrls: card.mainImageUrl ? [card.mainImageUrl] : undefined,
        lat: card.lat ?? undefined,
        lng: card.lng ?? undefined,
        extras: Object.keys(extras).length > 0 ? extras : undefined,
      },
    });
  }
  return items;
}
