/**
 * Parser puro de listados de Fotocasa.
 *
 * Modo PREFERIDO (HTML real servido por Bright Data Web Unlocker):
 * extrae los anuncios desde `window.__INITIAL_PROPS__.initialSearch.result.realEstates`.
 * Cada item del array contiene la card completa: id, address, coordinates,
 * description, **phone**, rawPrice/price, multimedia[], clientType,
 * clientAlias, publisherId, detail (URL por idioma), features. Es la fuente
 * más rica y NO requiere ventanas regex sobre HTML.
 *
 * Modo FALLBACK (HTML degradado / sin SSR): regex sobre `<a href="/es/comprar/vivienda/.../d">`
 * con extracción de precio y features por ventana, mantenido para no
 * romper si Fotocasa cambia su build.
 *
 * Estructura observada (HTML real 7/05/2026 vía web_unlocker1):
 *  - URLs de ficha: `/es/comprar/vivienda/<ciudad>-capital/<feature-slug>/<ID>/d`
 *  - El precio (`X.XXX €`) aparece típicamente 200-1000 caracteres
 *    antes del href, dentro del DOM que renderiza la card.
 *  - El área (`XX m²`) y habitaciones (`X hab`) aparecen pegadas (~100 chars)
 *    al href, dentro del bloque de features.
 *
 * El parser NO usa JSON-LD: Fotocasa solo expone `BreadcrumbList` y un
 * `RealEstateListing` agregado, ninguno por anuncio individual.
 */

import type { MarketExtractorItem } from "../../../../../lib/workers/market-worker/extractor";
import { parseFotocasaInitialProps } from "../../../../../lib/workers/market-worker/fotocasa-initial-props";
import { normalizePhone } from "../../../../../lib/market";
import { computeFotocasaContentHash } from "./content-hash";

const FOTOCASA_HOST = "https://www.fotocasa.es";

/** Captura la URL completa de la ficha y el ID numérico al final del path. */
const DETAIL_LINK_RE =
  /href="(\/es\/comprar\/vivienda\/[^"\s]+?\/(\d{6,})\/d)"/g;

const PRICE_RE = /(\d{1,3}(?:\.\d{3})+|\d{4,9})\s*€/;
const PRICE_RE_GLOBAL = /(\d{1,3}(?:\.\d{3})+|\d{4,9})\s*€/g;
const SURFACE_RE = /(\d{1,4})\s*m(?:²|2|\b)/i;
const ROOMS_RE = /(\d{1,2})\s*(?:hab\.?|habs\.?|habitaciones?|dormitorios?|dormit)/i;
const BATHROOMS_RE = /(\d{1,2})\s*(?:baños?|banyos?)/i;

const NOISE_QUERY_KEYS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "mkwid",
  "from",
  "stc",
  "ordenado-por",
  "adid",
]);

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

export function canonicalizeFotocasaUrl(href: string): string {
  try {
    const url = new URL(href, FOTOCASA_HOST);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (NOISE_QUERY_KEYS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    let out = url.toString();
    if (out.endsWith("/") && url.pathname !== "/") out = out.slice(0, -1);
    return out;
  } catch {
    return href;
  }
}

export function extractFotocasaListingId(canonicalUrl: string): string | null {
  try {
    const m = new URL(canonicalUrl, FOTOCASA_HOST).pathname.match(/\/(\d{6,})\/d$/);
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
 * Detecta si el HTML corresponde a una página bloqueada por anti-bot.
 * Fotocasa devuelve HTTP 403 con HTML ~12 KB cuando bloquea (ver
 * `docs/portal-html-analysis.md`).
 */
export function detectBlockedPage(html: string): BlockDetection {
  if (!html || html.length < 200) {
    return { blocked: true, reason: "Respuesta vacía o demasiado corta" };
  }
  // Páginas de bloqueo de Fotocasa pesan ~12 KB; las normales >> 500 KB.
  // Un umbral conservador evita falsos positivos para páginas pequeñas
  // legítimas (filtros muy estrictos sin resultados).
  if (html.length < 50_000 && /uso indebido|access denied|verificaci[oó]n|robot|captcha/i.test(html)) {
    return { blocked: true, reason: "Página de bloqueo Fotocasa detectada" };
  }
  const lower = html.toLowerCase();
  if (lower.includes("captcha") && lower.includes("robot")) {
    return { blocked: true, reason: "Captcha/anti-bot detectado en HTML" };
  }
  if (
    !lower.includes("/es/comprar/") &&
    !lower.includes("fotocasa")
  ) {
    return {
      blocked: true,
      reason: "HTML no contiene marcadores típicos de Fotocasa",
    };
  }
  return { blocked: false };
}

// ---------------------------------------------------------------------------
// Parser principal
// ---------------------------------------------------------------------------

export interface ParsedFotocasaCard {
  externalId: string | null;
  canonicalUrl: string;
  priceRaw: string | null;
  title: string | null;
  addressRaw: string | null;
  rawText: string;
  surfaceRaw: string | null;
  roomsRaw: string | null;
  bathroomsRaw: string | null;
  zoneRaw: string | null;
  mainImageUrl: string | null;
  /**
   * Datos opcionales que solo se rellenan cuando el parser usa la vía
   * `__INITIAL_PROPS__` (HTML real con SSR). En modo regex-fallback se
   * dejan como `undefined` y el handler de detalle los completará al
   * fetchear la ficha.
   */
  description?: string | null;
  phones?: string[];
  imageUrls?: string[];
  advertiserName?: string | null;
  advertiserType?: "agency" | "particular" | null;
  publisherId?: string | null;
  rawPrice?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  zipCode?: string | null;
  neighborhood?: string | null;
}

export interface ParseFotocasaListingResult {
  cards: ParsedFotocasaCard[];
  /** URLs canonicalizadas únicas detectadas (incluye descartadas, si las hubiera). */
  detectedUrlsCount: number;
}

/**
 * Extrae cards del HTML de un listado de Fotocasa.
 *
 * Vía PREFERIDA: `window.__INITIAL_PROPS__.initialSearch.result.realEstates`
 * (HTML real servido por Bright Data Web Unlocker). Trae datos COMPLETOS
 * por anuncio (descripción, teléfono, multimedia, coordenadas, tipo de
 * anunciante…). Si el script no existe (HTML degradado / scrapeo legacy
 * tipo browser headless) se cae al modo regex-fallback.
 *
 * Vía FALLBACK (regex-only):
 *  1. Buscar todos los hrefs de ficha `/es/comprar/vivienda/.../<ID>/d`.
 *  2. Para cada uno, extraer una ventana de ~7 KB hacia atrás y 2 KB
 *     hacia delante (cubre el bloque típico de una card).
 *  3. Buscar dentro de la ventana:
 *     - El precio **más cercano al href** (no el primero).
 *     - Área (`X m²`) y habitaciones (`X hab`) cerca del href.
 *  4. Deduplicar por URL canonicalizada.
 */
export function parseFotocasaListingHtml(html: string): ParseFotocasaListingResult {
  // Vía preferida: __INITIAL_PROPS__.initialSearch.result.realEstates
  const fromInitialProps = parseListingFromInitialProps(html);
  if (fromInitialProps && fromInitialProps.cards.length > 0) {
    return fromInitialProps;
  }

  // Fallback: regex sobre HTML.
  const cards: ParsedFotocasaCard[] = [];
  const seenUrls = new Set<string>();

  const re = new RegExp(DETAIL_LINK_RE.source, DETAIL_LINK_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) != null) {
    const href = match[1];
    if (!href) continue;
    const canonicalUrl = canonicalizeFotocasaUrl(href);
    if (seenUrls.has(canonicalUrl)) continue;
    seenUrls.add(canonicalUrl);

    const card = extractCard(html, match.index, canonicalUrl);
    if (card) cards.push(card);
  }

  return { cards, detectedUrlsCount: seenUrls.size };
}

/**
 * Vía preferida: extrae cards desde `__INITIAL_PROPS__.initialSearch.result.realEstates`.
 *
 * Estructura observada por item:
 *   {
 *     id: 188063260,
 *     realEstateAdId: "uuid-...",
 *     address: { country, district, neighborhood, zipCode, municipality, ... },
 *     coordinates: { latitude, longitude, accuracy },
 *     description: "...",
 *     phone: "+34957488346",            // ← no requiere click
 *     rawPrice: 297000,                 // numérico
 *     price: "297.000 €",               // formateado
 *     multimedia: [{ type:"image", src:"https://static.fotocasa.es/..." }],
 *     clientType: "professional",       // o "private"/"particular"
 *     clientAlias: "...", clientId: 0, publisherId: "uuid-...",
 *     detail: { "es-ES":"/es/comprar/vivienda/.../d", ... },
 *     features: [{key:"air_conditioner", value:1}, ...],
 *     buildingType:"Flat", buildingSubtype:"Flat",
 *     transactionTypeId:1, typeId:2, subtypeId:1,
 *     ...
 *   }
 *
 * Mapeo:
 *  - `detail["es-ES"]` → canonicalUrl (con dominio)
 *  - `id` → externalId (string)
 *  - `phone` → phones (normalizado, único)
 *  - `description` → description (raw)
 *  - `multimedia[].src` → imageUrls (filter type=image)
 *  - `clientType` → advertiserType
 *  - `clientAlias` → advertiserName
 *  - `address.neighborhood` → zoneRaw
 *  - `address.zipCode` → zipCode
 *  - `coordinates.latitude/longitude` → lat/lng
 */
function parseListingFromInitialProps(html: string): ParseFotocasaListingResult | null {
  const props = parseFotocasaInitialProps(html);
  if (!props) return null;
  const initialSearch = props.initialSearch as Record<string, unknown> | undefined;
  const result = initialSearch?.result as Record<string, unknown> | undefined;
  const ads = result?.realEstates;
  if (!Array.isArray(ads) || ads.length === 0) return null;

  const cards: ParsedFotocasaCard[] = [];
  const seenUrls = new Set<string>();

  for (const raw of ads) {
    if (!raw || typeof raw !== "object") continue;
    const ad = raw as Record<string, unknown>;
    const card = adEntityToCard(ad);
    if (!card) continue;
    if (seenUrls.has(card.canonicalUrl)) continue;
    seenUrls.add(card.canonicalUrl);
    cards.push(card);
  }

  return { cards, detectedUrlsCount: seenUrls.size };
}

function adEntityToCard(ad: Record<string, unknown>): ParsedFotocasaCard | null {
  const detail = ad.detail as Record<string, unknown> | undefined;
  const detailEs = (detail?.["es-ES"] ?? detail?.["es_ES"]) as string | undefined;
  if (!detailEs || typeof detailEs !== "string") return null;
  const canonicalUrl = canonicalizeFotocasaUrl(detailEs);
  const externalId = extractFotocasaListingId(canonicalUrl);

  const address = (ad.address ?? {}) as Record<string, unknown>;
  const coordinates = (ad.coordinates ?? {}) as Record<string, unknown>;

  const phoneRaw = typeof ad.phone === "string" ? ad.phone : null;
  const phoneNormalized = phoneRaw ? normalizePhone(phoneRaw) : null;
  const phones = phoneNormalized ? [phoneNormalized] : [];

  const multimedia = ad.multimedia;
  const imageUrls = extractListingImages(multimedia);
  const mainImageUrl = imageUrls[0] ?? null;

  const description = typeof ad.description === "string" ? ad.description : null;

  const clientTypeRaw = typeof ad.clientType === "string" ? ad.clientType.toLowerCase() : null;
  const advertiserType: ParsedFotocasaCard["advertiserType"] =
    clientTypeRaw === "professional"
      ? "agency"
      : clientTypeRaw === "private" ||
        clientTypeRaw === "particular" ||
        clientTypeRaw === "user"
        ? "particular"
        : null;

  const advertiserName =
    (typeof ad.clientAlias === "string" && ad.clientAlias.trim()) ||
    (typeof ad.clientName === "string" && (ad.clientName as string).trim()) ||
    null;

  const publisherId = typeof ad.publisherId === "string" ? ad.publisherId : null;

  const rawPrice = typeof ad.rawPrice === "number" ? ad.rawPrice : null;
  const priceFormatted =
    typeof ad.price === "string" && ad.price.trim() ? ad.price.trim() : null;
  const priceRaw = priceFormatted ?? (rawPrice != null ? `${rawPrice} €` : null);

  const neighborhood =
    (typeof address.neighborhood === "string" && address.neighborhood.trim()) || null;
  const zipCode = (typeof address.zipCode === "string" && address.zipCode.trim()) || null;

  const lat = typeof coordinates.latitude === "number" ? coordinates.latitude : null;
  const lng = typeof coordinates.longitude === "number" ? coordinates.longitude : null;

  const surfaceRaw = pickFeatureValue(ad.features, "surface");
  const roomsRaw = pickFeatureValue(ad.features, "rooms");
  const bathroomsRaw = pickFeatureValue(ad.features, "bathrooms");

  const title =
    (typeof ad.location === "string" && ad.location.trim()) ||
    (description ? description.split("\n")[0]?.trim().slice(0, 200) : null) ||
    null;

  return {
    externalId: externalId ?? (typeof ad.id === "number" ? String(ad.id) : null),
    canonicalUrl,
    priceRaw,
    title,
    addressRaw: title,
    rawText: description ? description.slice(0, 800) : "",
    surfaceRaw,
    roomsRaw,
    bathroomsRaw,
    zoneRaw: neighborhood,
    mainImageUrl,
    description,
    phones,
    imageUrls,
    advertiserName,
    advertiserType,
    publisherId,
    rawPrice,
    latitude: lat,
    longitude: lng,
    zipCode,
    neighborhood,
  };
}

function extractListingImages(multimedia: unknown): string[] {
  if (!Array.isArray(multimedia)) return [];
  const out: string[] = [];
  for (const m of multimedia) {
    if (!m || typeof m !== "object") continue;
    const item = m as Record<string, unknown>;
    if (typeof item.type === "string" && item.type !== "image") continue;
    const src = item.src ?? item.url;
    if (typeof src === "string" && /^https?:\/\//i.test(src)) {
      out.push(src);
    }
  }
  // Deduplicar preservando orden.
  const seen = new Set<string>();
  return out.filter((u) => (seen.has(u) ? false : (seen.add(u), true)));
}

/**
 * Fotocasa expone features como array `[{key:"air_conditioner", value:1}, ...]`
 * con keys conocidas: `surface`, `rooms`, `bathrooms`, `floor`, etc.
 *
 * Devuelve el valor como string para mantener compatibilidad con el
 * extractor (que históricamente trabaja con strings raw).
 */
function pickFeatureValue(features: unknown, key: string): string | null {
  if (!Array.isArray(features)) return null;
  for (const f of features) {
    if (!f || typeof f !== "object") continue;
    const item = f as Record<string, unknown>;
    if (item.key === key && typeof item.value !== "undefined" && item.value !== null) {
      return String(item.value);
    }
  }
  return null;
}

function extractCard(
  html: string,
  hrefIndex: number,
  canonicalUrl: string,
): ParsedFotocasaCard | null {
  const externalId = extractFotocasaListingId(canonicalUrl);

  // Ventana amplia hacia atrás (precio suele estar antes del href en Fotocasa)
  // y más corta hacia adelante (features y CTA).
  const windowStart = Math.max(0, hrefIndex - 7000);
  const windowEnd = Math.min(html.length, hrefIndex + 2000);
  const window = html.slice(windowStart, windowEnd);

  // Texto plano de la ventana para regex de habs/área.
  const text = collapseWhitespace(stripTags(window));

  // --- Precio ---
  // Tomamos el más cercano al href (en posiciones del HTML original).
  const priceRaw = pickClosestPriceToHref(html, hrefIndex);

  // --- Área y habitaciones ---
  const surfaceMatch = text.match(SURFACE_RE);
  const surfaceRaw = surfaceMatch ? surfaceMatch[1] : null;

  const roomsMatch = text.match(ROOMS_RE);
  const roomsRaw = roomsMatch ? roomsMatch[1] : null;

  const bathroomsMatch = text.match(BATHROOMS_RE);
  const bathroomsRaw = bathroomsMatch ? bathroomsMatch[1] : null;

  // --- Title ---
  const title = extractTitleFromWindow(window);
  const addressRaw = title;

  // --- Zona ---
  const zoneRaw = inferZoneFromUrl(canonicalUrl);
  const mainImageUrl = extractMainImageFromWindow(window);

  return {
    externalId,
    canonicalUrl,
    priceRaw,
    title,
    addressRaw,
    rawText: text.slice(0, 800),
    surfaceRaw,
    roomsRaw,
    bathroomsRaw,
    zoneRaw,
    mainImageUrl,
  };
}

/**
 * Devuelve el `X.XXX €` más cercano (en distancia de caracteres) al href.
 * Busca en una ventana ancha porque el precio en Fotocasa puede estar
 * cientos de chars antes del enlace.
 */
function pickClosestPriceToHref(html: string, hrefIndex: number): string | null {
  const searchStart = Math.max(0, hrefIndex - 8000);
  const searchEnd = Math.min(html.length, hrefIndex + 3000);
  const slice = html.slice(searchStart, searchEnd);
  const matches: Array<{ raw: string; absoluteIdx: number }> = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(PRICE_RE_GLOBAL.source, PRICE_RE_GLOBAL.flags);
  while ((m = re.exec(slice)) != null) {
    matches.push({ raw: `${m[1]} €`, absoluteIdx: searchStart + m.index });
  }
  if (matches.length === 0) return null;
  let best = matches[0]!;
  let bestDist = Math.abs(best.absoluteIdx - hrefIndex);
  for (const candidate of matches) {
    const d = Math.abs(candidate.absoluteIdx - hrefIndex);
    if (d < bestDist) {
      best = candidate;
      bestDist = d;
    }
  }
  return best.raw;
}

function extractTitleFromWindow(window: string): string | null {
  // Intento 1: atributo title="..." en el anchor (cuando existe).
  const titleAttr = window.match(/title="([^"]{8,200})"/);
  if (titleAttr?.[1]) return collapseWhitespace(titleAttr[1]);
  // Intento 2: primer h2/h3 del bloque.
  const h = window.match(/<h[23][^>]*>([\s\S]{1,300}?)<\/h[23]>/i);
  if (h?.[1]) return collapseWhitespace(stripTags(h[1]));
  return null;
}

function extractMainImageFromWindow(window: string): string | null {
  // Fotocasa usa normalmente imágenes en `static.fotocasa.es/images/ads/...`
  // en `src` o `srcset` dentro del bloque de card.
  const m = window.match(
    /https:\/\/static\.fotocasa\.es\/images\/ads\/[^\s"'<>]+/i,
  );
  return m?.[0] ?? null;
}

function inferZoneFromUrl(canonicalUrl: string): string | null {
  // Fotocasa: /es/comprar/vivienda/<ciudad>-capital/<features-slug>/<ID>/d
  // El segundo segmento tras `vivienda` es features (ascensor, jardin, ...),
  // no una zona estable. Devolvemos null y dejamos que la zona se infiera
  // del seed o del campo cityFromSeed que se inyecta arriba.
  void canonicalUrl;
  return null;
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
  cards: ParsedFotocasaCard[],
  ctx: ToItemContext,
): MarketExtractorItem[] {
  const items: MarketExtractorItem[] = [];
  for (const card of cards) {
    const contentHash = computeFotocasaContentHash({
      externalId: card.externalId,
      canonicalUrl: card.canonicalUrl,
      priceRaw: card.priceRaw,
      title: card.title,
      surfaceRaw: card.surfaceRaw,
      roomsRaw: card.roomsRaw,
      zoneRaw: card.zoneRaw,
    });
    // Cuando la card vino del JSON SSR (`__INITIAL_PROPS__`) ya trae
    // descripción, teléfonos, imageUrls completas y advertiser. Las
    // pasamos al payload para que el handler de detalle pueda saltar
    // (o priorizar) la fetch de la ficha.
    const imageUrls =
      card.imageUrls && card.imageUrls.length > 0
        ? card.imageUrls
        : card.mainImageUrl
          ? [card.mainImageUrl]
          : undefined;

    // Campos no soportados nativamente por `RawListingPayload` se
    // empaquetan en `extras` (description larga, rawPrice numérico,
    // publisherId, zipCode, neighborhood). El handler de detalle los
    // lee desde extras para enriquecer el `MarketListing` canónico.
    const extras: Record<string, unknown> = {};
    if (card.description) extras.description = card.description;
    if (card.publisherId) extras.publisherId = card.publisherId;
    if (card.rawPrice != null) extras.rawPrice = card.rawPrice;
    if (card.zipCode) extras.zipCode = card.zipCode;
    if (card.neighborhood) extras.neighborhood = card.neighborhood;

    items.push({
      externalId: card.externalId,
      canonicalUrl: card.canonicalUrl,
      contentHash,
      httpStatus: ctx.httpStatus,
      payload: {
        title: card.title ?? undefined,
        url: card.canonicalUrl,
        rawText: card.rawText,
        priceRaw: card.priceRaw ?? undefined,
        surfaceRaw: card.surfaceRaw ?? undefined,
        roomsRaw: card.roomsRaw ?? undefined,
        bathroomsRaw: card.bathroomsRaw ?? undefined,
        addressRaw: card.addressRaw ?? undefined,
        cityRaw: ctx.cityFromSeed,
        zoneRaw: card.zoneRaw ?? ctx.defaultZone ?? undefined,
        operationRaw: "venta",
        housingRaw: "vivienda",
        mainImageUrl: card.mainImageUrl ?? undefined,
        imageUrls,
        advertiserName: card.advertiserName ?? undefined,
        advertiserType: card.advertiserType ?? undefined,
        phones: card.phones && card.phones.length > 0 ? card.phones : undefined,
        lat: card.latitude ?? undefined,
        lng: card.longitude ?? undefined,
        extras: Object.keys(extras).length > 0 ? extras : undefined,
      },
    });
  }
  return items;
}
