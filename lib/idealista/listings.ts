import type { Page } from "playwright";
import { normalizeListingFields, normalizeWhitespace } from "./normalize";
import type { IdealistaCity, IdealistaListing, IdealistaOperation } from "./types";

export type RawIdealistaCard = {
  title: string;
  url: string;
  text: string;
  priceRaw?: string;
  agencyName?: string;
  imageUrls: string[];
};

function hasSaleDetailUrl(url: string): boolean {
  try {
    const parsed = new URL(url, "https://www.idealista.com");
    return parsed.hostname.endsWith("idealista.com") && parsed.pathname.includes("/inmueble/");
  } catch {
    return false;
  }
}

export function dedupeRawCards(cards: RawIdealistaCard[]): RawIdealistaCard[] {
  const seen = new Set<string>();
  const result: RawIdealistaCard[] = [];
  for (const card of cards) {
    const key = card.url || `${card.title}:${card.text.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(card);
  }
  return result;
}

export function normalizeRawCards(
  cards: RawIdealistaCard[],
  context: { city: IdealistaCity; operation: IdealistaOperation; capturedAt?: string },
): IdealistaListing[] {
  return dedupeRawCards(cards)
    .filter((card) => card.title && card.url && hasSaleDetailUrl(card.url))
    .map((card) =>
      normalizeListingFields({
        city: context.city,
        operation: context.operation,
        url: card.url,
        title: card.title,
        rawText: card.text,
        priceRaw: card.priceRaw,
        agencyName: card.agencyName,
        imageUrls: card.imageUrls,
        capturedAt: context.capturedAt,
      }),
    );
}

export async function extractListingCardsFromPage(
  page: Page,
  context: { city: IdealistaCity; operation: IdealistaOperation; maxListings: number },
): Promise<IdealistaListing[]> {
  const cards = await page.evaluate<RawIdealistaCard[]>(`(() => {
    function clean(value) {
      return (value ?? "").replace(/\\s+/g, " ").trim();
    }

    const pricePattern = new RegExp("^[0-9]{1,3}(?:\\\\.[0-9]{3})+\\\\s*€$|^[0-9]{4,9}\\\\s*€$");
    const links = [...document.querySelectorAll("a[href*='/inmueble/']")];
    return links
      .map((link) => {
        const article = link.closest("article") ?? link.closest(".item") ?? link.parentElement ?? link;
        const title =
          clean(article.querySelector(".item-link, a.item-link, h2, h3")?.textContent) ||
          clean(link.getAttribute("title")) ||
          clean(link.textContent);
        const url = new URL(link.href, window.location.href).toString();
        const text = clean(article.textContent);
        const priceRaw = [...article.querySelectorAll(".item-price, span, div")]
          .map((node) => clean(node.textContent))
          .find((value) => pricePattern.test(value));
        const agencyName =
          clean(article.querySelector(".professional-name, .item-toolbar-contact .logo-branding span")?.textContent) ||
          undefined;
        const imageUrls = [...article.querySelectorAll("img")]
          .map((img) => img.currentSrc || img.src || img.getAttribute("data-src"))
          .filter(Boolean);
        return { title, url, text, priceRaw, agencyName, imageUrls };
      })
      .filter((card) => card.title && card.text && card.url.includes("/inmueble/"));
  })()`);

  return normalizeRawCards(cards, {
    city: context.city,
    operation: context.operation,
  })
    .filter((listing) => normalizeWhitespace(listing.title).length > 0)
    .slice(0, context.maxListings);
}
