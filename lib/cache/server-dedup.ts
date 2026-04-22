import { cache } from "react";
import { getCachedPlatformSummary } from "@/lib/platform/queries";
import { getCachedCeoOverview } from "@/lib/dashboard/ceo/cached-queries";

/**
 * React.cache() wrappers for use in Server Components.
 * These deduplicate calls within the same React render tree.
 * Route Handlers do NOT benefit from this (they are not part of the render tree).
 */
export const getPlatformSummaryDeduped = cache(() => getCachedPlatformSummary());
export const getCeoOverviewDeduped = cache(() => getCachedCeoOverview());
