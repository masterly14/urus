import type { Page } from "playwright";
import {
  extractFirstNumber,
  extractFloor,
  inferNeighborhood,
  normalizeWhitespace,
} from "./normalize";
import type { IdealistaDetail } from "./types";

const SURFACE_RE = /(\d{1,4})\s*m(?:²|2|\b)/i;
const ROOMS_RE = /(\d{1,2})\s*(?:hab\.?|habs\.?|habitaciones?|dormitorios?)/i;
const BATHROOMS_RE = /(\d{1,2})\s*(?:baño|baños|banyos?)/i;

export async function extractDetailFromPage(page: Page, url: string): Promise<IdealistaDetail> {
  const detail = await page.evaluate<{
    title: string;
    bodyText: string;
    description?: string;
    agencyName?: string;
    imageUrls: string[];
  }>(`(() => {
    function clean(value) {
      return (value ?? "").replace(/\\s+/g, " ").trim();
    }
    const title = clean(document.querySelector("h1")?.textContent);
    const bodyText = clean(document.body.textContent);
    const description =
      clean(document.querySelector(".comment, .adCommentsLanguage, [data-testid*='description' i]")?.textContent) ||
      undefined;
    const agencyName =
      clean(document.querySelector(".professional-name, .advertiser-name, .name")?.textContent) ||
      undefined;
    const imageUrls = [...document.querySelectorAll("img")]
      .map((img) => img.currentSrc || img.src || img.getAttribute("data-src"))
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
