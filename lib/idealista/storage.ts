import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { IdealistaDiscoveryReport, IdealistaListing } from "./types";

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const text = Array.isArray(value) ? value.join(" | ") : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function ensureOutputDir(outputDir: string): Promise<void> {
  await mkdir(outputDir, { recursive: true });
}

export async function writeJsonl(filePath: string, listings: IdealistaListing[]): Promise<void> {
  const content = listings.map((listing) => JSON.stringify(listing)).join("\n");
  await writeFile(filePath, content ? `${content}\n` : "", "utf8");
}

export async function writeCsv(filePath: string, listings: IdealistaListing[]): Promise<void> {
  const headers: (keyof IdealistaListing)[] = [
    "source",
    "operation",
    "city",
    "listingId",
    "url",
    "title",
    "price",
    "priceRaw",
    "surfaceM2",
    "rooms",
    "bathrooms",
    "floor",
    "neighborhood",
    "addressApprox",
    "agencyName",
    "capturedAt",
  ];
  const rows = [
    headers.join(","),
    ...listings.map((listing) => headers.map((header) => csvEscape(listing[header])).join(",")),
  ];
  await writeFile(filePath, `${rows.join("\n")}\n`, "utf8");
}

export async function writeDiscoveryReport(
  outputDir: string,
  reports: IdealistaDiscoveryReport[],
): Promise<string> {
  const filePath = path.join(outputDir, "discovery-report.json");
  await writeFile(filePath, JSON.stringify(reports, null, 2), "utf8");
  return filePath;
}

export function dedupeListings(listings: IdealistaListing[]): IdealistaListing[] {
  const seen = new Set<string>();
  const result: IdealistaListing[] = [];
  for (const listing of listings) {
    const key = listing.listingId ?? listing.url;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(listing);
  }
  return result;
}

export function validateListings(listings: IdealistaListing[]): string[] {
  const errors: string[] = [];
  for (const [index, listing] of listings.entries()) {
    if (!listing.url) errors.push(`Registro ${index}: falta url`);
    if (!listing.title) errors.push(`Registro ${index}: falta title`);
    if (listing.price == null && !listing.priceRaw) {
      errors.push(`Registro ${index}: falta price/priceRaw`);
    }
  }
  return errors;
}
