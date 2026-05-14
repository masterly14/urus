import { createHash } from "node:crypto";
import type { MarketSource } from "@prisma/client";
import { enqueueJob } from "@/lib/job-queue";
import { prisma } from "@/lib/prisma";
import { portalForSource } from "@/lib/market/source-mapping";

const DEFAULT_IMPORT_PORTALS = ["idealista"] as const;

function parseImportPortalsEnv(raw: string | undefined): Set<string> {
  const value = (raw ?? "").trim();
  if (!value) return new Set(DEFAULT_IMPORT_PORTALS);

  return new Set(
    value
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean),
  );
}

function normalizeUrls(urls: string[]): string[] {
  return urls.filter((url) => /^https?:\/\//i.test(url)).slice(0, 30);
}

function buildMarketImageImportIdempotencyKey(
  listingId: string,
  imageUrls: string[],
): string {
  const digest = createHash("sha1").update(imageUrls.join("|")).digest("hex").slice(0, 16);
  return `market:image-import:${listingId}:${digest}`;
}

export function shouldRequestMarketImageImport(source: MarketSource): boolean {
  const portal = portalForSource(source);
  return parseImportPortalsEnv(process.env.MARKET_IMAGE_IMPORT_PORTALS).has(portal);
}

export type MarketListingImageSelection = {
  fotos: string[];
  imageCacheStatus: "IMPORTED" | "PENDING" | undefined;
  shouldQueueImport: boolean;
};

export function selectMarketListingImages(input: {
  source: MarketSource;
  portalImages: string[];
  importedImages: string[];
}): MarketListingImageSelection {
  const imported = normalizeUrls(input.importedImages);
  if (imported.length > 0) {
    return {
      fotos: imported,
      imageCacheStatus: "IMPORTED",
      shouldQueueImport: false,
    };
  }

  const portal = normalizeUrls(input.portalImages);
  if (portal.length === 0) {
    return {
      fotos: [],
      imageCacheStatus: undefined,
      shouldQueueImport: false,
    };
  }

  const shouldQueueImport = shouldRequestMarketImageImport(input.source);
  return {
    fotos: portal,
    imageCacheStatus: shouldQueueImport ? "PENDING" : undefined,
    shouldQueueImport,
  };
}

export async function queueMarketImageImportsForListings(
  listings: Array<{ id: string; source: MarketSource; imageUrls: string[] }>,
): Promise<void> {
  for (const listing of listings) {
    if (!shouldRequestMarketImageImport(listing.source)) continue;
    const normalizedUrls = normalizeUrls(listing.imageUrls);
    if (normalizedUrls.length === 0) continue;

    const existing = await prisma.marketListingImage.findMany({
      where: { listingId: listing.id },
      select: {
        imageIndex: true,
        originalImageUrl: true,
        status: true,
        cloudinarySecureUrl: true,
      },
    });
    const byIndex = new Map(existing.map((row) => [row.imageIndex, row]));

    let shouldEnqueue = false;
    for (const [imageIndex, url] of normalizedUrls.entries()) {
      const row = byIndex.get(imageIndex);
      const alreadyImportedCurrentUrl =
        row?.status === "IMPORTED" &&
        row.originalImageUrl === url &&
        Boolean(row.cloudinarySecureUrl);

      if (alreadyImportedCurrentUrl) continue;
      shouldEnqueue = true;

      await prisma.marketListingImage.upsert({
        where: {
          listingId_imageIndex: {
            listingId: listing.id,
            imageIndex,
          },
        },
        create: {
          listingId: listing.id,
          imageIndex,
          originalImageUrl: url,
          status: "PENDING",
        },
        update: {
          originalImageUrl: url,
          status: "PENDING",
          errorReason: null,
        },
      });
    }

    if (!shouldEnqueue) continue;
    await enqueueJob({
      type: "MARKET_IMPORT_LISTING_IMAGES",
      payload: {
        listingId: listing.id,
      },
      priority: 85,
      maxAttempts: 4,
      idempotencyKey: buildMarketImageImportIdempotencyKey(
        listing.id,
        normalizedUrls,
      ),
    });
  }
}
