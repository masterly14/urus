import { isExpiredStatefoxImageUrl } from "@/lib/statefox/image-expiry";
import type { PricingComparable } from "@/lib/pricing/types";
import { getStatefoxImageImportConfig } from "./config";
import { enqueueStatefoxImageImportsForComparables } from "./enqueue";
import { runHybridImageImport } from "./orchestrator";
import { getImportedImagesByStatefoxIds, toCloudinaryUrls } from "./repo";
import type { CachedStatefoxImage } from "./types";

export function selectComparablePhotos(args: {
  cachedUrls: string[];
  statefoxUrls: string[];
}): string[] {
  if (args.cachedUrls.length > 0) return args.cachedUrls;
  return args.statefoxUrls.filter((url) => !isExpiredStatefoxImageUrl(url));
}

async function loadCache(
  statefoxIds: string[],
): Promise<Map<string, CachedStatefoxImage[]>> {
  try {
    return await getImportedImagesByStatefoxIds(statefoxIds);
  } catch (err) {
    console.warn(
      `[statefox:image-cache] No se pudo consultar cache Cloudinary: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return new Map<string, CachedStatefoxImage[]>();
  }
}

export async function hydrateComparablesWithImageCache<T extends PricingComparable>(
  comparables: T[],
): Promise<T[]> {
  if (comparables.length === 0) return comparables;

  const config = getStatefoxImageImportConfig();
  const ids = comparables.map((c) => c.statefoxId);
  let cached = await loadCache(ids);

  const acceptedIds = new Set<string>();
  if (config.enabled && config.syncOnFirstSeen && config.syncMaxComparables > 0) {
    const missingCandidates = comparables
      .filter((c) => !cached.has(c.statefoxId) && Boolean(c.link))
      .slice(0, config.syncMaxComparables)
      .map((c) => ({ statefoxId: c.statefoxId, portalUrl: c.link as string }));

    if (missingCandidates.length > 0) {
      const result = await runHybridImageImport(missingCandidates);
      const completed = result.attempts.filter((a) => a.status === "completed").length;
      const queued = result.queuedCount + result.acceptedCount;
      for (const attempt of result.attempts) {
        if (attempt.status === "accepted" || attempt.status === "queued") {
          acceptedIds.add(attempt.statefoxId);
        }
      }
      if (completed > 0 || queued > 0) {
        cached = await loadCache(ids);
        console.log(
          `[statefox:image-cache] Hybrid import (${result.mode}): completed=${completed} accepted=${result.acceptedCount} queued=${result.queuedCount} failed=${result.failedCount}`,
        );
      }
    }
  }

  const hydrated = comparables.map((comparable) => {
    const cachedUrls = toCloudinaryUrls(cached.get(comparable.statefoxId) ?? []);
    const fotos = selectComparablePhotos({
      cachedUrls,
      statefoxUrls: comparable.fotos ?? [],
    });
    return {
      ...comparable,
      fotos,
      imageCacheStatus:
        cachedUrls.length > 0
          ? "IMPORTED"
          : acceptedIds.has(comparable.statefoxId)
            ? "PENDING"
            : "PENDING",
    } as T;
  });

  if (config.enabled) {
    const missingCache = comparables
      .filter((c) => {
        const cachedImages = cached.get(c.statefoxId) ?? [];
        return cachedImages.length === 0 && Boolean(c.link);
      })
      .map((c) => ({ statefoxId: c.statefoxId, portalUrl: c.link as string }));
    if (missingCache.length > 0) {
      await enqueueStatefoxImageImportsForComparables(missingCache);
    }
  }

  return hydrated;
}
