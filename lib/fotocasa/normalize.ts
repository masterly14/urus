import type { FotocasaListing } from "./types";

const EURO_PRICE_RE = /(?:^|\s)(\d{1,3}(?:[.\s]\d{3})+|\d{4,9})\s*€/;
const SURFACE_RE = /(\d{1,4})\s*m(?:²|2|\b)/i;
const ROOMS_RE = /(\d{1,2})\s*(?:habs?\.?|habitaciones?|dormitorios?)/i;
const BATHROOMS_RE = /(\d{1,2})\s*(?:baños?|banyos?)/i;
const FLOOR_RE =
  /(?:^|\s)((?:\d{1,2}[ªºa]?\s*)?planta|bajo|ático|atico|entresuelo|principal)(?:\s|$)/i;

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function parseSpanishNumber(value: string): number | undefined {
  const normalized = value.replace(/[.\s]/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function extractPrice(text: string): { price?: number; priceRaw?: string } {
  const cleanedText = normalizeWhitespace(text).replace(
    /\d{1,2}\/\d{1,3}?(\d{1,3}(?:[.\s]\d{3})+\s*€)/g,
    " $1",
  );
  const match = cleanedText.match(EURO_PRICE_RE);
  if (!match) return {};

  return {
    price: parseSpanishNumber(match[1]),
    priceRaw: `${match[1]} €`,
  };
}

export function extractFirstNumber(text: string, regex: RegExp): number | undefined {
  const match = normalizeWhitespace(text).match(regex);
  if (!match) return undefined;
  return parseSpanishNumber(match[1]);
}

export function extractFloor(text: string): string | undefined {
  const match = normalizeWhitespace(text).match(FLOOR_RE);
  return match ? normalizeWhitespace(match[1]) : undefined;
}

export function extractListingId(url: string): string | undefined {
  const parsed = new URL(url);
  const detailId = parsed.pathname.match(/\/(\d{6,})(?:\/d)?$/i)?.[1];
  if (detailId) return detailId;

  return parsed.searchParams.get("id") ?? undefined;
}

export function canonicalizeFotocasaUrl(url: string): string {
  const parsed = new URL(url, "https://www.fotocasa.es");
  parsed.hash = "";
  for (const key of [...parsed.searchParams.keys()]) {
    if (["from", "stc", "gclid", "mkwid", "utm_source", "utm_medium", "utm_campaign"].includes(key)) {
      parsed.searchParams.delete(key);
    }
  }
  return parsed.toString();
}

export function inferNeighborhood(text: string, title?: string): string | undefined {
  const source = normalizeWhitespace(title ?? text);
  const inMatch = source.match(/\ben\s+([^,€]{3,80})(?:,|\d|$)/i);
  if (inMatch) return normalizeWhitespace(inMatch[1]);

  const dashMatch = source.match(/\s-\s([^,€]{3,80})(?:,|\d|$)/i);
  return dashMatch ? normalizeWhitespace(dashMatch[1]) : undefined;
}

export function normalizeListingFields(
  input: Pick<FotocasaListing, "url" | "title" | "city" | "operation" | "imageUrls"> & {
    rawText: string;
    capturedAt?: string;
  },
): FotocasaListing {
  const normalizedText = normalizeWhitespace(input.rawText);
  const { price, priceRaw } = extractPrice(normalizedText);

  return {
    source: "fotocasa",
    operation: input.operation,
    city: input.city,
    listingId: extractListingId(input.url),
    url: canonicalizeFotocasaUrl(input.url),
    title: normalizeWhitespace(input.title),
    price,
    priceRaw,
    surfaceM2: extractFirstNumber(normalizedText, SURFACE_RE),
    rooms: extractFirstNumber(normalizedText, ROOMS_RE),
    bathrooms: extractFirstNumber(normalizedText, BATHROOMS_RE),
    floor: extractFloor(normalizedText),
    neighborhood: inferNeighborhood(normalizedText, input.title),
    imageUrls: [...new Set(input.imageUrls)].slice(0, 20),
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    rawText: normalizedText,
  };
}
