import type { Prisma, StatefoxImageCacheStatus, StatefoxPortalSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { CachedStatefoxImage } from "./types";

const IMPORTED_STATUS: StatefoxImageCacheStatus = "IMPORTED";
const TERMINAL_STATUSES = new Set<StatefoxImageCacheStatus>([
  "IMPORTED",
  "BLOCKED",
  "CAPTCHA",
  "LISTING_REMOVED",
  "NO_IMAGES_FOUND",
]);

export async function getImportedImagesByStatefoxIds(
  statefoxIds: string[],
): Promise<Map<string, CachedStatefoxImage[]>> {
  const uniqueIds = Array.from(new Set(statefoxIds.filter(Boolean)));
  if (uniqueIds.length === 0) return new Map();

  const rows = await prisma.statefoxComparableImage.findMany({
    where: {
      statefoxId: { in: uniqueIds },
      status: IMPORTED_STATUS,
      cloudinarySecureUrl: { not: null },
    },
    orderBy: [{ statefoxId: "asc" }, { imageIndex: "asc" }],
  });

  const byId = new Map<string, CachedStatefoxImage[]>();
  for (const row of rows) {
    const list = byId.get(row.statefoxId) ?? [];
    list.push(row);
    byId.set(row.statefoxId, list);
  }
  return byId;
}

export async function hasTerminalImageImportState(args: {
  source: StatefoxPortalSource;
  statefoxId: string;
}): Promise<boolean> {
  const row = await prisma.statefoxComparableImage.findFirst({
    where: {
      source: args.source,
      statefoxId: args.statefoxId,
      status: { in: Array.from(TERMINAL_STATUSES) },
    },
    select: { id: true },
  });
  return Boolean(row);
}

export async function markImageImportPending(args: {
  source: StatefoxPortalSource;
  statefoxId: string;
  portalUrl: string;
}): Promise<void> {
  await prisma.statefoxComparableImage.upsert({
    where: {
      source_statefoxId_imageIndex: {
        source: args.source,
        statefoxId: args.statefoxId,
        imageIndex: 0,
      },
    },
    create: {
      source: args.source,
      statefoxId: args.statefoxId,
      portalUrl: args.portalUrl,
      imageIndex: 0,
      status: "PENDING",
    },
    update: {
      portalUrl: args.portalUrl,
      status: "PENDING",
      errorReason: null,
    },
  });
}

export async function recordImportedImage(args: {
  source: StatefoxPortalSource;
  statefoxId: string;
  portalUrl: string;
  imageIndex: number;
  originalImageUrl: string;
  originalImageSha256: string;
  cloudinaryPublicId: string;
  cloudinarySecureUrl: string;
  width?: number;
  height?: number;
  bytes: number;
  format?: string;
}): Promise<void> {
  const data: Prisma.StatefoxComparableImageUncheckedCreateInput = {
    source: args.source,
    statefoxId: args.statefoxId,
    portalUrl: args.portalUrl,
    imageIndex: args.imageIndex,
    originalImageUrl: args.originalImageUrl,
    originalImageSha256: args.originalImageSha256,
    cloudinaryPublicId: args.cloudinaryPublicId,
    cloudinarySecureUrl: args.cloudinarySecureUrl,
    width: args.width,
    height: args.height,
    bytes: args.bytes,
    format: args.format,
    status: "IMPORTED",
    errorReason: null,
    importedAt: new Date(),
    lastAttemptAt: new Date(),
  };

  await prisma.statefoxComparableImage.upsert({
    where: {
      source_statefoxId_imageIndex: {
        source: args.source,
        statefoxId: args.statefoxId,
        imageIndex: args.imageIndex,
      },
    },
    create: data,
    update: data,
  });
}

export async function recordImageImportStatus(args: {
  source: StatefoxPortalSource;
  statefoxId: string;
  portalUrl: string;
  status: Exclude<StatefoxImageCacheStatus, "IMPORTED">;
  errorReason?: string;
}): Promise<void> {
  await prisma.statefoxComparableImage.upsert({
    where: {
      source_statefoxId_imageIndex: {
        source: args.source,
        statefoxId: args.statefoxId,
        imageIndex: 0,
      },
    },
    create: {
      source: args.source,
      statefoxId: args.statefoxId,
      portalUrl: args.portalUrl,
      imageIndex: 0,
      status: args.status,
      errorReason: args.errorReason,
      lastAttemptAt: new Date(),
      attempts: 1,
    },
    update: {
      portalUrl: args.portalUrl,
      status: args.status,
      errorReason: args.errorReason,
      lastAttemptAt: new Date(),
      attempts: { increment: 1 },
    },
  });
}

export function toCloudinaryUrls(images: CachedStatefoxImage[]): string[] {
  return images
    .map((image) => image.cloudinarySecureUrl)
    .filter((url): url is string => Boolean(url));
}

export interface StatefoxImageCacheStatusEntry {
  statefoxId: string;
  source: StatefoxPortalSource | null;
  status: StatefoxImageCacheStatus | "UNKNOWN";
  cachedUrls: string[];
  importedCount: number;
  attempts: number;
  errorReason: string | null;
  updatedAt: string | null;
}

/**
 * Resumen agregado por statefoxId, optimizado para alimentar al polling
 * de la UI. Devuelve una entrada por id consultado, aunque no exista
 * registro previo (status="UNKNOWN").
 */
export async function getStatefoxImageCacheStatusByIds(
  statefoxIds: string[],
): Promise<Map<string, StatefoxImageCacheStatusEntry>> {
  const uniqueIds = Array.from(new Set(statefoxIds.filter(Boolean)));
  const map = new Map<string, StatefoxImageCacheStatusEntry>();
  for (const id of uniqueIds) {
    map.set(id, {
      statefoxId: id,
      source: null,
      status: "UNKNOWN",
      cachedUrls: [],
      importedCount: 0,
      attempts: 0,
      errorReason: null,
      updatedAt: null,
    });
  }
  if (uniqueIds.length === 0) return map;

  const rows = await prisma.statefoxComparableImage.findMany({
    where: { statefoxId: { in: uniqueIds } },
    orderBy: [{ statefoxId: "asc" }, { imageIndex: "asc" }],
  });

  for (const row of rows) {
    const entry = map.get(row.statefoxId);
    if (!entry) continue;
    if (row.cloudinarySecureUrl) {
      entry.cachedUrls.push(row.cloudinarySecureUrl);
      entry.importedCount++;
    }
    entry.source = row.source;
    entry.attempts = Math.max(entry.attempts, row.attempts);
    entry.errorReason = row.errorReason ?? entry.errorReason;
    const rowUpdatedAt = row.lastAttemptAt ?? row.importedAt ?? row.updatedAt;
    if (rowUpdatedAt) {
      const iso = rowUpdatedAt.toISOString();
      if (!entry.updatedAt || iso > entry.updatedAt) entry.updatedAt = iso;
    }
    // Promueve a status terminal "más fuerte" si aplica.
    const current = entry.status;
    if (current === "UNKNOWN" || current === "PENDING") {
      entry.status = row.status;
    } else if (row.status === "IMPORTED" && current !== "IMPORTED") {
      entry.status = "IMPORTED";
    }
  }

  for (const entry of map.values()) {
    if (entry.cachedUrls.length > 0) entry.status = "IMPORTED";
  }
  return map;
}
