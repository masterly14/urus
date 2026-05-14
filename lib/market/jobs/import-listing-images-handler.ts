import { canExecute, recordFailure, recordSuccess } from "@/lib/circuit-breaker";
import type { JobRecord } from "@/lib/job-queue/types";
import { getCloudinary } from "@/lib/cloudinary";
import { portalForSource } from "@/lib/market/source-mapping";
import { prisma } from "@/lib/prisma";
import { downloadPortalImage } from "@/lib/statefox/image-cache/upload";
import type { HandlerResult } from "@/lib/workers/consumer/types";

const RETRIABLE_STATUS = new Set(["FAILED"]);
const NON_RETRIABLE_STATUS = new Set([
  "BLOCKED",
  "CAPTCHA",
  "LISTING_REMOVED",
  "NO_IMAGES_FOUND",
]);
const DEFAULT_MAX_IMAGES = 20;

interface MarketImageImportPayload {
  listingId?: string;
  maxImages?: number;
}

function parsePayload(job: JobRecord): MarketImageImportPayload {
  return (job.payload ?? {}) as MarketImageImportPayload;
}

function resolveMaxImages(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.min(30, Math.floor(raw));
  }
  return DEFAULT_MAX_IMAGES;
}

function mapErrorStatus(err: unknown): "FAILED" | "BLOCKED" | "CAPTCHA" | "LISTING_REMOVED" {
  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  if (message.includes("http 403")) return "BLOCKED";
  if (message.includes("captcha")) return "CAPTCHA";
  if (message.includes("http 404")) return "LISTING_REMOVED";
  return "FAILED";
}

function buildCloudinaryContext(context: Record<string, string>): string {
  return Object.entries(context)
    .map(([key, value]) => `${key}=${value}`)
    .join("|");
}

async function uploadMarketImageToCloudinary(args: {
  listingId: string;
  sourcePortal: string;
  imageIndex: number;
  image: Awaited<ReturnType<typeof downloadPortalImage>>;
  canonicalUrl: string;
}): Promise<{
  publicId: string;
  secureUrl: string;
  width?: number;
  height?: number;
  bytes: number;
  format?: string;
}> {
  const cloudinary = getCloudinary();
  const publicId = `market/${args.sourcePortal}/${args.listingId}/${args.imageIndex}`;
  const dataUri = `data:${args.image.contentType};base64,${args.image.buffer.toString("base64")}`;
  const result = await cloudinary.uploader.upload(dataUri, {
    resource_type: "image",
    public_id: publicId,
    tags: ["market", "listing", args.sourcePortal],
    context: buildCloudinaryContext({
      listingId: args.listingId,
      sourcePortal: args.sourcePortal,
      canonicalUrl: args.canonicalUrl,
      originalImageUrl: args.image.url,
    }),
    overwrite: true,
    invalidate: true,
  });

  return {
    publicId: result.public_id,
    secureUrl: result.secure_url,
    width: result.width,
    height: result.height,
    bytes: result.bytes,
    format: result.format,
  };
}

export async function handleMarketImportListingImages(
  job: JobRecord,
): Promise<HandlerResult> {
  const payload = parsePayload(job);
  const listingId = typeof payload.listingId === "string" ? payload.listingId.trim() : "";
  if (!listingId) {
    return {
      success: false,
      error: "MARKET_IMPORT_LISTING_IMAGES requiere payload.listingId",
      permanent: true,
    };
  }

  const listing = await prisma.marketListing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      source: true,
      canonicalUrl: true,
      imageUrls: true,
    },
  });
  if (!listing) {
    return {
      success: false,
      error: `MarketListing ${listingId} no existe`,
      permanent: true,
    };
  }

  const portal = portalForSource(listing.source);
  const circuitId = `market-image-import:${portal}`;
  const { allowed, state } = await canExecute(circuitId);
  if (!allowed) {
    return {
      success: false,
      error: `Circuit breaker OPEN para ${circuitId} (${state.failureCount} fallos consecutivos)`,
    };
  }

  const urls = listing.imageUrls.filter((url) => /^https?:\/\//i.test(url));
  if (urls.length === 0) {
    await prisma.marketListingImage.upsert({
      where: {
        listingId_imageIndex: {
          listingId,
          imageIndex: 0,
        },
      },
      create: {
        listingId,
        imageIndex: 0,
        originalImageUrl: listing.canonicalUrl,
        status: "NO_IMAGES_FOUND",
        errorReason: "listing sin imageUrls",
        attempts: 1,
        lastAttemptAt: new Date(),
      },
      update: {
        status: "NO_IMAGES_FOUND",
        errorReason: "listing sin imageUrls",
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
      },
    });
    await recordSuccess(circuitId);
    return { success: true };
  }

  const maxImages = resolveMaxImages(payload.maxImages);
  let importedCount = 0;
  let lastRetriableError: string | undefined;
  const statuses: string[] = [];

  for (const [imageIndex, imageUrl] of urls.entries()) {
    if (imageIndex >= maxImages) break;
    const startedAt = new Date();
    await prisma.marketListingImage.upsert({
      where: {
        listingId_imageIndex: {
          listingId,
          imageIndex,
        },
      },
      create: {
        listingId,
        imageIndex,
        originalImageUrl: imageUrl,
        status: "IMPORTING",
        attempts: 1,
        lastAttemptAt: startedAt,
      },
      update: {
        originalImageUrl: imageUrl,
        status: "IMPORTING",
        errorReason: null,
        attempts: { increment: 1 },
        lastAttemptAt: startedAt,
      },
    });

    try {
      const downloaded = await downloadPortalImage({
        imageUrl,
        portalUrl: listing.canonicalUrl,
      });
      const uploaded = await uploadMarketImageToCloudinary({
        listingId,
        sourcePortal: portal,
        imageIndex,
        image: downloaded,
        canonicalUrl: listing.canonicalUrl,
      });

      await prisma.marketListingImage.update({
        where: {
          listingId_imageIndex: {
            listingId,
            imageIndex,
          },
        },
        data: {
          originalImageUrl: downloaded.url,
          originalImageSha256: downloaded.sha256,
          cloudinaryPublicId: uploaded.publicId,
          cloudinarySecureUrl: uploaded.secureUrl,
          width: uploaded.width,
          height: uploaded.height,
          bytes: uploaded.bytes,
          format: uploaded.format ?? downloaded.format,
          status: "IMPORTED",
          importedAt: new Date(),
          errorReason: null,
          lastAttemptAt: new Date(),
        },
      });
      statuses.push("IMPORTED");
      importedCount++;
    } catch (err) {
      const status = mapErrorStatus(err);
      const errorReason = err instanceof Error ? err.message : String(err);
      await prisma.marketListingImage.update({
        where: {
          listingId_imageIndex: {
            listingId,
            imageIndex,
          },
        },
        data: {
          status,
          errorReason,
          lastAttemptAt: new Date(),
        },
      });
      statuses.push(status);
      if (RETRIABLE_STATUS.has(status)) {
        lastRetriableError = errorReason;
      }
    }
  }

  console.log(
    `[market:image-import] listing=${listingId} portal=${portal} imported=${importedCount}/${Math.min(urls.length, maxImages)} statuses=${statuses.join(",")}`,
  );

  if (importedCount > 0) {
    await recordSuccess(circuitId);
    return { success: true };
  }

  const hasRetriable = statuses.some((status) => RETRIABLE_STATUS.has(status));
  const allNonRetriable =
    statuses.length > 0 && statuses.every((status) => NON_RETRIABLE_STATUS.has(status));
  if (allNonRetriable) {
    await recordSuccess(circuitId);
    return { success: true };
  }
  if (hasRetriable) {
    const reason = lastRetriableError ?? "No se pudo importar ninguna imagen";
    await recordFailure(circuitId, reason);
    return { success: false, error: reason };
  }

  await recordSuccess(circuitId);
  return { success: true };
}
