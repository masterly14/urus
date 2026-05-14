/**
 * Parser puro de listados de Pisos.com.
 *
 * Calibrado contra HTML real capturado el 6/05/2026 (ver
 * `docs/portal-html-analysis.md`). Pisos.com expone:
 *
 *  - **Cards en el DOM** con `<div id="<ID>.<AGENCY>" class="ad-preview">`
 *    que contiene precio (`X.XXX €`), área (`X m²`) y habitaciones (`X hab`).
 *  - **JSON-LD por anuncio** con `@type=SingleFamilyResidence` que da
 *    `@id="<ID>.<AGENCY>"`, `url`, `image`, `address` y `geo` (lat/lng
 *    con coma decimal española).
 *
 * Estrategia híbrida:
 *  1. Recorrer `<div id="<ID>.<AGENCY>" class="ad-preview">` para tener
 *     identidad y datos económicos.
 *  2. Cruzar con JSON-LD por `@id` para enriquecer con geo + imagen.
 *  3. Emitir un `ParsedPisoscomCard` por anuncio.
 */

import type { MarketExtractorItem } from "../../../../../lib/workers/market-worker/extractor";
import { computePisoscomContentHash } from "./content-hash";

const PISOSCOM_HOST = "https://www.pisos.com";

const AD_PREVIEW_BLOCK_RE =
  /<div id="(\d{8,})\.(\d+)"\s+class="ad-preview[^"]*"[\s\S]*?(?=<div id="\d{8,}\.\d+"\s+class="ad-preview|$)/g;

const JSON_LD_RE =
  /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;

const PRICE_RE = /(\d{1,3}(?:\.\d{3})+|\d{4,9})\s*€/;
const SURFACE_RE = /(\d{1,4})\s*m(?:²|2)/i;
const ROOMS_RE = /(\d{1,2})\s*(?:hab\.?|habs?\.?|habitaciones?|dormitorios?|dormit)/i;
const BATHROOMS_RE = /(\d{1,2})\s*(?:baños?|banyos?)/i;

const NOISE_QUERY_KEYS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "from",
  "stc",
  "mkwid",
]);

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

export function canonicalizePisoscomUrl(href: string): string {
  try {
    const url = new URL(href, PISOSCOM_HOST);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (NOISE_QUERY_KEYS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    // Asegurar trailing slash en fichas (Pisos.com lo usa).
    if (!url.pathname.endsWith("/") && /\d{8,}_\d+$/.test(url.pathname)) {
      url.pathname += "/";
    }
    return url.toString();
  } catch {
    return href;
  }
}

export function extractPisoscomListingId(canonicalUrl: string): string | null {
  try {
    const trimmed = new URL(canonicalUrl, PISOSCOM_HOST).pathname.replace(/\/$/, "");
    const last = trimmed.split("/").pop() ?? "";
    // Patrón verificado: `slug-<ID11+>_<AGENCY6+>`
    const m = last.match(/-(\d{8,})_\d+$/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

function inferHousingFromUrl(canonicalUrl: string): string {
  try {
    const url = new URL(canonicalUrl, PISOSCOM_HOST);
    const segments = url.pathname.split("/").filter(Boolean);
    // Las fichas viven en /comprar/{tipologia}-...
    const compraIdx = segments.indexOf("comprar");
    const slug = compraIdx >= 0 ? segments[compraIdx + 1] ?? "" : "";
    const tipo = slug.split("-")[0] ?? "";
    if (!tipo) return "vivienda";
    return tipo;
  } catch {
    return "vivienda";
  }
}

// ---------------------------------------------------------------------------
// Detección de bloqueo
// ---------------------------------------------------------------------------

export interface BlockDetection {
  blocked: boolean;
  reason?: string;
}

export function detectBlockedPage(html: string): BlockDetection {
  if (!html || html.length < 200) {
    return { blocked: true, reason: "Respuesta vacía o demasiado corta" };
  }
  const lower = html.toLowerCase();
  if (lower.includes("captcha") && lower.includes("robot")) {
    return { blocked: true, reason: "Captcha/anti-bot detectado en HTML" };
  }
  if (lower.includes("access denied") || lower.includes("forbidden")) {
    return { blocked: true, reason: "HTML de acceso denegado" };
  }
  // 404 personalizada de Pisos.com (page no encontrada): título "404".
  if (html.length < 50_000 && /<title[^>]*>\s*404\s*<\/title>/i.test(html)) {
    return { blocked: true, reason: "Página 404 (URL inválida)" };
  }
  if (!lower.includes("pisos.com") && !lower.includes("ad-preview")) {
    return { blocked: true, reason: "HTML no contiene marcadores típicos de Pisos.com" };
  }
  return { blocked: false };
}

// ---------------------------------------------------------------------------
// JSON-LD por anuncio
// ---------------------------------------------------------------------------

interface JsonLdResidence {
  externalId: string;
  agency: string;
  canonicalUrl: string;
  imageUrl: string | null;
  city: string | null;
  region: string | null;
  lat: number | null;
  lng: number | null;
}

function parseJsonLdResidences(html: string): Map<string, JsonLdResidence> {
  const out = new Map<string, JsonLdResidence>();
  const re = new RegExp(JSON_LD_RE.source, JSON_LD_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) != null) {
    let body = m[1];
    if (!body) continue;
    try {
      const data = JSON.parse(body) as Record<string, unknown>;
      if (data["@type"] !== "SingleFamilyResidence") continue;
      const id = typeof data["@id"] === "string" ? data["@id"] : "";
      if (!id || !id.includes(".")) continue;
      const [externalId, agency] = id.split(".");
      const url = typeof data.url === "string" ? data.url : "";
      const canonicalUrl = url ? canonicalizePisoscomUrl(url) : "";
      const image = typeof data.image === "string" ? data.image : null;
      const address = (data.address ?? {}) as Record<string, unknown>;
      const city = decodeHtmlEntities(typeof address.addressLocality === "string" ? address.addressLocality : "");
      const region = decodeHtmlEntities(typeof address.addressRegion === "string" ? address.addressRegion : "");
      const geo = (data.geo ?? {}) as Record<string, unknown>;
      const lat = parseSpanishFloat(typeof geo.latitude === "string" ? geo.latitude : null);
      const lng = parseSpanishFloat(typeof geo.longitude === "string" ? geo.longitude : null);
      out.set(externalId!, {
        externalId: externalId!,
        agency: agency ?? "",
        canonicalUrl,
        imageUrl: image,
        city: city || null,
        region: region || null,
        lat,
        lng,
      });
    } catch {
      // payload no JSON, lo ignoramos.
    }
  }
  return out;
}

function decodeHtmlEntities(value: string): string {
  if (!value) return "";
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_match, dec: string) =>
      String.fromCodePoint(parseInt(dec, 10)),
    );
}

function parseSpanishFloat(raw: string | null): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Parser principal
// ---------------------------------------------------------------------------

export interface ParsedPisoscomCard {
  externalId: string | null;
  canonicalUrl: string;
  priceRaw: string | null;
  title: string | null;
  rawText: string;
  surfaceRaw: string | null;
  roomsRaw: string | null;
  bathroomsRaw: string | null;
  zoneRaw: string | null;
  /** Datos enriquecidos desde JSON-LD cuando disponibles. */
  imageUrl: string | null;
  lat: number | null;
  lng: number | null;
}

export interface ParsePisoscomListingResult {
  cards: ParsedPisoscomCard[];
  detectedUrlsCount: number;
}

export function parsePisoscomListingHtml(html: string): ParsePisoscomListingResult {
  const ldByExternalId = parseJsonLdResidences(html);
  const cards: ParsedPisoscomCard[] = [];
  const seenIds = new Set<string>();

  const re = new RegExp(AD_PREVIEW_BLOCK_RE.source, AD_PREVIEW_BLOCK_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) != null) {
    const externalId = m[1];
    if (!externalId || seenIds.has(externalId)) continue;
    seenIds.add(externalId);

    const block = m[0];
    const ld = ldByExternalId.get(externalId) ?? null;

    const card = extractCardFromBlock(block, externalId, ld);
    if (card) cards.push(card);
  }

  return { cards, detectedUrlsCount: seenIds.size };
}

function extractCardFromBlock(
  block: string,
  externalId: string,
  ld: JsonLdResidence | null,
): ParsedPisoscomCard | null {
  const text = collapseWhitespace(stripTags(block));

  // Precio: el primero del bloque suele ser el precio del anuncio
  // (los siguientes son cuotas, gastos comunes, etc.).
  const priceMatch = text.match(PRICE_RE);
  const priceRaw = priceMatch ? `${priceMatch[1]} €` : null;

  const surfaceMatch = text.match(SURFACE_RE);
  const surfaceRaw = surfaceMatch ? surfaceMatch[1] : null;

  const roomsMatch = text.match(ROOMS_RE);
  const roomsRaw = roomsMatch ? roomsMatch[1] : null;

  const bathroomsMatch = text.match(BATHROOMS_RE);
  const bathroomsRaw = bathroomsMatch ? bathroomsMatch[1] : null;

  const title = extractTitleFromBlock(block);

  // URL canónica: preferimos data-lnk-href sobre el href del primer <a>.
  const dataLnk = block.match(/data-lnk-href="([^"]+)"/);
  const firstAnchor = block.match(/<a[^>]*href="(\/comprar\/[^"]+)"/);
  const rawUrl =
    (ld?.canonicalUrl && ld.canonicalUrl) ||
    (dataLnk?.[1] ? canonicalizePisoscomUrl(dataLnk[1]) : null) ||
    (firstAnchor?.[1] ? canonicalizePisoscomUrl(firstAnchor[1]) : null);
  if (!rawUrl) return null;

  const zoneRaw = ld?.region ?? null;

  return {
    externalId,
    canonicalUrl: rawUrl,
    priceRaw,
    title,
    rawText: text.slice(0, 800),
    surfaceRaw,
    roomsRaw,
    bathroomsRaw,
    zoneRaw,
    imageUrl: ld?.imageUrl ?? null,
    lat: ld?.lat ?? null,
    lng: ld?.lng ?? null,
  };
}

function extractTitleFromBlock(block: string): string | null {
  // Pisos.com usa <a class="ad-preview__title" title="...">Texto</a>.
  const titleAttr = block.match(/<a[^>]*class="[^"]*ad-preview__title[^"]*"[^>]*>([\s\S]*?)<\/a>/);
  if (titleAttr?.[1]) {
    const txt = collapseWhitespace(stripTags(titleAttr[1]));
    if (txt) return txt;
  }
  const anyTitle = block.match(/title="([^"]{8,200})"/);
  if (anyTitle?.[1]) return collapseWhitespace(anyTitle[1]);
  const h = block.match(/<h[23][^>]*>([\s\S]{1,300}?)<\/h[23]>/i);
  if (h?.[1]) return collapseWhitespace(stripTags(h[1]));
  return null;
}

function stripTags(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ");
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Conversión a MarketExtractorItem
// ---------------------------------------------------------------------------

export interface ToItemContext {
  cityFromSeed: string;
  defaultZone: string | null;
  httpStatus: number | null;
}

export function cardsToExtractorItems(
  cards: ParsedPisoscomCard[],
  ctx: ToItemContext,
): MarketExtractorItem[] {
  const items: MarketExtractorItem[] = [];
  for (const card of cards) {
    const contentHash = computePisoscomContentHash({
      externalId: card.externalId,
      canonicalUrl: card.canonicalUrl,
      priceRaw: card.priceRaw,
      title: card.title,
      surfaceRaw: card.surfaceRaw,
      roomsRaw: card.roomsRaw,
      zoneRaw: card.zoneRaw,
    });
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
        cityRaw: ctx.cityFromSeed,
        zoneRaw: card.zoneRaw ?? ctx.defaultZone ?? undefined,
        operationRaw: "venta",
        housingRaw: inferHousingFromUrl(card.canonicalUrl),
        mainImageUrl: card.imageUrl ?? undefined,
        lat: card.lat ?? undefined,
        lng: card.lng ?? undefined,
      },
    });
  }
  return items;
}
