import type { StatefoxImageCacheStatus, StatefoxPortalSource } from "@prisma/client";
import type { BrightDataSessionDetails } from "@/lib/scraping/brightdata-session";

export type PortalImageCandidate = {
  url: string;
  source: "dom" | "script" | "network";
  width?: number;
  height?: number;
};

export type CachedStatefoxImage = {
  statefoxId: string;
  source: StatefoxPortalSource;
  imageIndex: number;
  portalUrl: string;
  originalImageUrl: string | null;
  cloudinaryPublicId: string | null;
  cloudinarySecureUrl: string | null;
  status: StatefoxImageCacheStatus;
};

export type StatefoxImageImportPayload = {
  statefoxId: string;
  portalUrl: string;
  source?: StatefoxPortalSource;
  maxImages?: number;
};

export type StatefoxImageImportOutcome = {
  statefoxId: string;
  source: StatefoxPortalSource;
  status: StatefoxImageCacheStatus;
  importedCount: number;
  candidateCount: number;
  errorReason?: string;
};

export type PortalImageDiscovery = {
  source: StatefoxPortalSource;
  portalUrl: string;
  candidates: PortalImageCandidate[];
  status: "ok" | "blocked" | "captcha" | "listing_removed" | "no_images_found" | "failed";
  errorReason?: string;
  cookies?: string;
  userAgent?: string;
  brightDataSessionId?: string;
  brightDataSession?: BrightDataSessionDetails;
};
