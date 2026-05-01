import type { Page } from "playwright";
import { normalizeListingFields, normalizeWhitespace, parseSpanishNumber } from "./normalize";
import type { FotocasaCity, FotocasaListing, FotocasaOperation } from "./types";

export type RawListingCard = {
  title: string;
  url: string;
  text: string;
  priceRaw?: string;
  imageUrls: string[];
};

function hasSaleDetailUrl(url: string): boolean {
  try {
    const parsed = new URL(url, "https://www.fotocasa.es");
    return parsed.hostname.endsWith("fotocasa.es") && parsed.pathname.includes("/comprar/");
  } catch {
    return false;
  }
}

export function dedupeRawCards(cards: RawListingCard[]): RawListingCard[] {
  const seen = new Set<string>();
  const result: RawListingCard[] = [];

  for (const card of cards) {
    const key = card.url || `${card.title}:${card.text.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(card);
  }

  return result;
}

export function normalizeRawCards(
  cards: RawListingCard[],
  context: { city: FotocasaCity; operation: FotocasaOperation; capturedAt?: string },
): FotocasaListing[] {
  return dedupeRawCards(cards)
    .filter((card) => card.title && card.url && hasSaleDetailUrl(card.url))
    .map((card) => {
      const listing = normalizeListingFields({
        city: context.city,
        operation: context.operation,
        url: card.url,
        title: card.title,
        imageUrls: card.imageUrls,
        rawText: card.text,
        capturedAt: context.capturedAt,
      });
      if (!card.priceRaw) return listing;
      return {
        ...listing,
        priceRaw: card.priceRaw,
        price: parseSpanishNumber(card.priceRaw.replace("€", "")),
      };
    });
}

export async function extractListingCardsFromPage(
  page: Page,
  context: { city: FotocasaCity; operation: FotocasaOperation; maxListings: number },
): Promise<FotocasaListing[]> {
  const cards = await page.evaluate<RawListingCard[]>(`(() => {
    function clean(value) {
      return (value ?? "").replace(/\s+/g, " ").trim();
    }

    function nearestCard(link) {
      return (
        link.closest("article") ??
        link.closest("li") ??
        link.closest("[data-testid]") ??
        link.parentElement ??
        link
      );
    }

    const links = [...document.querySelectorAll("a[href*='/comprar/']")].filter((link) => {
      try {
        const url = new URL(link.href, window.location.href);
        return (
          url.pathname.includes("/comprar/vivienda/") &&
          url.pathname.endsWith("/d") &&
          !url.searchParams.has("multimedia")
        );
      } catch {
        return false;
      }
    });
    const exactPricePattern = new RegExp("^[0-9]{1,3}(?:\\\\.[0-9]{3})+\\\\s*€$|^[0-9]{4,9}\\\\s*€$");
    const pricePattern = new RegExp("[0-9][0-9.\\\\s]*\\\\s*€");
    const rawCards = links
      .map((link) => {
        const card = nearestCard(link);
        const title =
          clean(card.querySelector("h2,h3,h4")?.textContent) ||
          clean(link.getAttribute("title")) ||
          clean(link.textContent);
        const url = new URL(link.href, window.location.href).toString();
        const text = clean(card.textContent);
        const priceRaw = [...card.querySelectorAll("span,div")]
          .map((node) => clean(node.textContent))
          .find((value) => exactPricePattern.test(value));
        const imageUrls = [...card.querySelectorAll("img")]
          .map((img) => img.currentSrc || img.src)
          .filter(Boolean);

        return { title, url, text, priceRaw, imageUrls };
      })
      .filter((card) => card.title && card.text && pricePattern.test(card.text));

    return rawCards;
  })()`);

  const normalized = normalizeRawCards(cards, {
    city: context.city,
    operation: context.operation,
  });

  return normalized
    .filter((listing) => normalizeWhitespace(listing.title).length > 0)
    .slice(0, context.maxListings);
}
