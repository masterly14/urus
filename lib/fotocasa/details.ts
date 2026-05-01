import type { Page } from "playwright";
import {
  extractFirstNumber,
  extractFloor,
  inferNeighborhood,
  normalizeWhitespace,
} from "./normalize";
import type { FotocasaDetail } from "./types";

const SURFACE_RE = /(\d{1,4})\s*m(?:²|2|\b)/i;
const ROOMS_RE = /(\d{1,2})\s*(?:habs?\.?|habitaciones?|dormitorios?)/i;
const BATHROOMS_RE = /(\d{1,2})\s*(?:baños?|banyos?)/i;

export async function extractDetailFromPage(page: Page, url: string): Promise<FotocasaDetail> {
  const detail = await page.evaluate<{
    title: string;
    bodyText: string;
    description?: string;
    agencyName?: string;
    imageUrls: string[];
  }>(`(() => {
    function clean(value) {
      return (value ?? "").replace(/\s+/g, " ").trim();
    }

    const bodyText = clean(document.body.textContent);
    const title = clean(document.querySelector("h1")?.textContent);
    const description =
      clean(
        document.querySelector("[data-testid*='description' i]")?.textContent ??
          document.querySelector("section p")?.textContent,
      ) || undefined;
    const agencyName =
      clean(
        document.querySelector("[data-testid*='agency' i]")?.textContent ??
          document.querySelector("[class*='agency' i]")?.textContent,
      ) || undefined;
    const imageUrls = [...document.querySelectorAll("img")]
      .map((img) => img.currentSrc || img.src)
      .filter(Boolean);

    return { title, bodyText, description, agencyName, imageUrls };
  })()`);

  const sourceText = normalizeWhitespace(`${detail.title} ${detail.bodyText}`);

  return {
    url,
    blockedByRobots: false,
    description: detail.description,
    agencyName: detail.agencyName,
    neighborhood: inferNeighborhood(sourceText, detail.title),
    floor: extractFloor(sourceText),
    surfaceM2: extractFirstNumber(sourceText, SURFACE_RE),
    rooms: extractFirstNumber(sourceText, ROOMS_RE),
    bathrooms: extractFirstNumber(sourceText, BATHROOMS_RE),
    imageUrls: [...new Set(detail.imageUrls)].slice(0, 40),
  };
}
