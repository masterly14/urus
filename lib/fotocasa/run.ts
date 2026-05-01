import path from "node:path";
import {
  acceptCookieBannerIfPresent,
  assertFotocasaPageAccessible,
  createFotocasaBrowser,
  politeDelay,
} from "./browser";
import { DEFAULT_FOTOCASA_OPTIONS, FOTOCASA_SEEDS } from "./config";
import { attachDiscoveryRecorder, runDiscoveryForSeed } from "./discover";
import { extractDetailFromPage } from "./details";
import { extractListingCardsFromPage } from "./listings";
import { evaluateRobots, fetchFotocasaRobots } from "./robots";
import {
  dedupeListings,
  ensureOutputDir,
  validateListings,
  writeCsv,
  writeDiscoveryReport,
  writeJsonl,
} from "./storage";
import type { FotocasaDiscoveryReport, FotocasaListing, FotocasaScrapeOptions } from "./types";

export type FotocasaRunResult = {
  listings: FotocasaListing[];
  reports: FotocasaDiscoveryReport[];
  outputFiles: string[];
  validationErrors: string[];
};

function selectSeeds(options: FotocasaScrapeOptions) {
  return FOTOCASA_SEEDS.filter(
    (seed) =>
      seed.operation === options.operation &&
      (options.city === "all" || options.city == null || seed.city === options.city),
  );
}

function mergeDetail(listing: FotocasaListing, detail: Awaited<ReturnType<typeof extractDetailFromPage>>) {
  return {
    ...listing,
    description: detail.description ?? listing.description,
    agencyName: detail.agencyName ?? listing.agencyName,
    addressApprox: detail.addressApprox ?? listing.addressApprox,
    neighborhood: detail.neighborhood ?? listing.neighborhood,
    floor: detail.floor ?? listing.floor,
    surfaceM2: detail.surfaceM2 ?? listing.surfaceM2,
    rooms: detail.rooms ?? listing.rooms,
    bathrooms: detail.bathrooms ?? listing.bathrooms,
    imageUrls: detail.imageUrls?.length ? detail.imageUrls : listing.imageUrls,
  };
}

export async function runFotocasaScraper(
  inputOptions: Partial<FotocasaScrapeOptions> = {},
): Promise<FotocasaRunResult> {
  const options: FotocasaScrapeOptions = {
    ...DEFAULT_FOTOCASA_OPTIONS,
    ...inputOptions,
  };
  const seeds = selectSeeds(options);
  if (seeds.length === 0) {
    throw new Error(`No hay URLs semilla para city=${String(options.city)} operation=${options.operation}`);
  }

  const policy = await fetchFotocasaRobots();
  const reports: FotocasaDiscoveryReport[] = [];
  const collected: FotocasaListing[] = [];

  for (const seed of seeds) {
    const seedDecision = evaluateRobots(policy, seed.url);
    if (!seedDecision.allowed) {
      throw new Error(
        `robots.txt bloquea la URL semilla ${seed.url} por regla ${seedDecision.matchedRule}`,
      );
    }

    const { browser, page } = await createFotocasaBrowser(options.headless);
    try {
      const recorder = attachDiscoveryRecorder(page);
      await page.goto(seed.url, { waitUntil: "domcontentloaded" });
      await assertFotocasaPageAccessible(page, seed.url);
      await acceptCookieBannerIfPresent(page);
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);

      const listings = await extractListingCardsFromPage(page, {
        city: seed.city,
        operation: seed.operation,
        maxListings: options.maxListingsPerSeed,
      });
      collected.push(...listings);

      reports.push(
        await runDiscoveryForSeed({
          page,
          seed,
          policy,
          listings,
          endpoints: recorder.endpoints,
        }),
      );
      recorder.detach();
    } finally {
      await browser.close();
    }
    await politeDelay(options.delayMs);
  }

  let detailBudget = options.maxDetails;
  for (let index = 0; index < collected.length && detailBudget > 0; index++) {
    const listing = collected[index];
    const detailDecision = evaluateRobots(policy, listing.url);
    if (!detailDecision.allowed) {
      detailBudget -= 1;
      continue;
    }

    const { browser, page } = await createFotocasaBrowser(options.headless);
    try {
      await page.goto(listing.url, { waitUntil: "domcontentloaded" });
      await assertFotocasaPageAccessible(page, listing.url);
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
      const detail = await extractDetailFromPage(page, listing.url);
      collected[index] = mergeDetail(listing, detail);
      detailBudget -= 1;
    } finally {
      await browser.close();
    }
    await politeDelay(options.delayMs);
  }

  const listings = dedupeListings(collected);
  const validationErrors = validateListings(listings);
  const outputFiles: string[] = [];

  if (!options.dryRun) {
    await ensureOutputDir(options.outputDir);
    const jsonlPath = path.join(options.outputDir, "sales.jsonl");
    const csvPath = path.join(options.outputDir, "sales.csv");
    await writeJsonl(jsonlPath, listings);
    await writeCsv(csvPath, listings);
    outputFiles.push(jsonlPath, csvPath, await writeDiscoveryReport(options.outputDir, reports));
  }

  return { listings, reports, outputFiles, validationErrors };
}
