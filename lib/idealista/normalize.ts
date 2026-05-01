import type { IdealistaListing } from "./types";

const PRICE_RE = /(?:^|\s)(\d{1,3}(?:[.\s]\d{3})+|\d{4,9})\s*€/;
const SURFACE_RE = /(\d{1,4})\s*m(?:²|2|\b)/i;
const ROOMS_RE = /(\d{1,2})\s*(?:hab\.?|habs\.?|habitaciones?|dormitorios?)/i;
const BATHROOMS_RE = /(\d{1,2})\s*(?:baño|baños|banyos?)/i;
const FLOOR_RE =
  /\b(planta\s*\d{1,2}[ªºa]?|bajo|ático|atico|entresuelo|principal)(?=\s|$)/i;

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function parseSpanishNumber(value: string): number | undefined {
  const normalized = value.replace(/[.\s]/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function extractPrice(text: string): { price?: number; priceRaw?: string } {
  const match = normalizeWhitespace(text).match(PRICE_RE);
  if (!match) return {};
  return {
    price: parseSpanishNumber(match[1]),
    priceRaw: `${match[1]}€`,
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

export function canonicalizeIdealistaUrl(url: string): string {
  const parsed = new URL(url, "https://www.idealista.com");
  parsed.hash = "";
  for (const key of [...parsed.searchParams.keys()]) {
    if (key.startsWith("utm_") || ["ordenado-por", "adId"].includes(key)) {
      parsed.searchParams.delete(key);
    }
  }
  return parsed.toString();
}

export function extractListingId(url: string): string | undefined {
  const parsed = new URL(url, "https://www.idealista.com");
  const match = parsed.pathname.match(/\/inmueble\/(\d+)\/?/);
  return match?.[1];
}

export function inferNeighborhood(text: string, title?: string): string | undefined {
  const source = normalizeWhitespace(title ?? text);
  const commaParts = source.split(",").map((part) => normalizeWhitespace(part));
  if (commaParts.length >= 2) return commaParts.at(-2);
  const inMatch = source.match(/\ben\s+([^,€]{3,80})(?:,|\d|$)/i);
  return inMatch ? normalizeWhitespace(inMatch[1]) : undefined;
}

export function normalizeListingFields(
  input: Pick<IdealistaListing, "url" | "title" | "city" | "operation" | "imageUrls"> & {
    rawText: string;
    priceRaw?: string;
    agencyName?: string;
    capturedAt?: string;
  },
): IdealistaListing {
  const normalizedText = normalizeWhitespace(input.rawText);
  const priceData = input.priceRaw
    ? {
        priceRaw: input.priceRaw,
        price: parseSpanishNumber(input.priceRaw.replace("€", "")),
      }
    : extractPrice(normalizedText);

  return {
    source: "idealista",
    operation: input.operation,
    city: input.city,
    listingId: extractListingId(input.url),
    url: canonicalizeIdealistaUrl(input.url),
    title: normalizeWhitespace(input.title),
    price: priceData.price,
    priceRaw: priceData.priceRaw,
    surfaceM2: extractFirstNumber(normalizedText, SURFACE_RE),
    rooms: extractFirstNumber(normalizedText, ROOMS_RE),
    bathrooms: extractFirstNumber(normalizedText, BATHROOMS_RE),
    floor: extractFloor(normalizedText),
    neighborhood: inferNeighborhood(normalizedText, input.title),
    agencyName: input.agencyName,
    imageUrls: [...new Set(input.imageUrls)].slice(0, 20),
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    rawText: normalizedText,
  };
}
