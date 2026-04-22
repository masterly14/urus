import { revalidateTag } from "next/cache";
import { CACHE_INVALIDATION_MAP } from "./invalidation-map";

const EXPIRE_IMMEDIATELY = { expire: 0 } as const;

/**
 * Invalidates all cache tags associated with a given event type.
 * Safe to call from any server context — silently no-ops if the
 * Next.js cache runtime is not available (e.g. standalone workers).
 */
export function invalidateCacheForEvent(eventType: string): void {
  const tags = CACHE_INVALIDATION_MAP[eventType as keyof typeof CACHE_INVALIDATION_MAP];
  if (!tags?.length) return;

  for (const tag of tags) {
    try {
      revalidateTag(tag, EXPIRE_IMMEDIATELY);
    } catch {
      // Not in a Next.js server context (e.g. standalone worker process)
    }
  }
}
