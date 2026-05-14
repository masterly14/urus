import type { StatefoxPortalSource } from "@prisma/client";
import type { PortalImageCandidate } from "./types";

const ICON_DIMENSIONS = [
  16, 24, 32, 48, 57, 60, 64, 72, 76, 96, 114, 120, 128, 144, 152, 167, 180, 192,
];
const ICON_DIMENSION_PATTERN = new RegExp(
  `/(?:${ICON_DIMENSIONS.join("|")})x(?:${ICON_DIMENSIONS.join("|")})\\.(?:png|jpe?g|webp|avif)`,
  "i",
);

const STATIC_ASSET_HINTS = [
  "/static/",
  "/assets/",
  "/icons/",
  "/sprites/",
  "/sprite",
  "/logo",
  "/favicon",
  "/touch-icon",
  "apple-touch-icon",
  "android-chrome",
  "/banner",
  "/avatar",
  "/placeholder",
];

function isLikelyStaticAsset(url: string): boolean {
  const lower = url.toLowerCase();
  if (ICON_DIMENSION_PATTERN.test(lower)) return true;
  return STATIC_ASSET_HINTS.some((hint) => lower.includes(hint));
}

const IDEALISTA_PHOTO_HOSTNAME_RE = /(?:^|\.)(?:img|fotos)\d*\.idealista\.com$/i;
const IDEALISTA_PHOTO_PATH_HINTS = [
  "/blur/",
  "/thumbnail/",
  "id.pro.es.image.master",
  "WEB_LISTING",
  "WEB_DETAIL",
];
const IDEALISTA_STATIC_HOSTNAME_RE = /(?:^|\.)st\d*\.idealista\.com$/i;

const IDEALISTA_VARIANT_RANK: Record<string, number> = {
  WEB_DETAIL_TOP_L_L: 0,
  WEB_DETAIL_M_L: 1,
  WEB_DETAIL: 2,
  WEB_LISTING: 3,
};

const IDEALISTA_MASTER_PATH_RE =
  /\/id\.pro\.es\.image\.master\/((?:[^/]+\/){0,5}?[^/]+?)\.(jpe?g|webp|avif|png)$/i;
const IDEALISTA_VARIANT_RE = /\/blur\/([A-Z0-9_-]+)\/\d+\/id\.pro\.es\.image\.master\//i;

function parseIdealistaUrl(url: URL): { masterKey: string; variantKey: string; ext: string } | null {
  const masterMatch = IDEALISTA_MASTER_PATH_RE.exec(url.pathname);
  if (!masterMatch) return null;
  const variantMatch = IDEALISTA_VARIANT_RE.exec(url.pathname);
  const variant = variantMatch?.[1] ?? "OTHER";
  return {
    masterKey: masterMatch[1]!.toLowerCase(),
    variantKey: variant.replace(/-/g, "_").toUpperCase(),
    ext: masterMatch[2]!.toLowerCase(),
  };
}

function isIdealistaListingImage(url: URL): boolean {
  if (IDEALISTA_PHOTO_HOSTNAME_RE.test(url.hostname)) {
    return IDEALISTA_PHOTO_PATH_HINTS.some((hint) => url.pathname.includes(hint));
  }
  return false;
}

function shouldKeepIdealista(candidate: PortalImageCandidate): boolean {
  let parsed: URL;
  try {
    parsed = new URL(candidate.url);
  } catch {
    return false;
  }
  if (IDEALISTA_STATIC_HOSTNAME_RE.test(parsed.hostname)) return false;
  if (isLikelyStaticAsset(parsed.href)) return false;
  return isIdealistaListingImage(parsed) || /idealista\.com/i.test(parsed.hostname);
}

const FOTOCASA_PHOTO_HOSTNAME_RE = /(?:^|\.)fotocasa\.es$|(?:^|\.)fotocasa\.com$|(?:^|\.)scmstatic\.fotocasa\./i;
function shouldKeepFotocasa(candidate: PortalImageCandidate): boolean {
  let parsed: URL;
  try {
    parsed = new URL(candidate.url);
  } catch {
    return false;
  }
  if (isLikelyStaticAsset(parsed.href)) return false;
  return FOTOCASA_PHOTO_HOSTNAME_RE.test(parsed.hostname);
}

function shouldKeepGeneric(candidate: PortalImageCandidate): boolean {
  return !isLikelyStaticAsset(candidate.url);
}

function rankFor(source: StatefoxPortalSource, candidate: PortalImageCandidate): number {
  if (source !== "idealista") return 0;
  let url: URL;
  try {
    url = new URL(candidate.url);
  } catch {
    return 100;
  }
  let score = 0;
  if (IDEALISTA_PHOTO_HOSTNAME_RE.test(url.hostname)) score -= 100;
  if (url.pathname.includes("WEB_DETAIL")) score -= 10;
  else if (url.pathname.includes("WEB_LISTING")) score -= 5;
  if (url.pathname.includes("/blur/")) score -= 3;
  if (candidate.source === "network") score -= 2;
  if (candidate.source === "dom") score -= 1;
  return score;
}

function variantRank(variantKey: string): number {
  if (variantKey in IDEALISTA_VARIANT_RANK) return IDEALISTA_VARIANT_RANK[variantKey]!;
  return 99;
}

function extPreference(ext: string): number {
  if (ext === "jpg" || ext === "jpeg") return 0;
  if (ext === "webp") return 1;
  if (ext === "avif") return 2;
  return 3;
}

function dedupIdealistaCandidates(
  candidates: PortalImageCandidate[],
): PortalImageCandidate[] {
  type Entry = {
    candidate: PortalImageCandidate;
    masterKey: string;
    variantKey: string;
    ext: string;
  };
  const grouped = new Map<string, Entry>();
  const passthrough: PortalImageCandidate[] = [];

  for (const candidate of candidates) {
    let url: URL;
    try {
      url = new URL(candidate.url);
    } catch {
      continue;
    }
    const parsed = parseIdealistaUrl(url);
    if (!parsed) {
      passthrough.push(candidate);
      continue;
    }
    const existing = grouped.get(parsed.masterKey);
    if (!existing) {
      grouped.set(parsed.masterKey, { candidate, ...parsed });
      continue;
    }
    const existingScore = variantRank(existing.variantKey) * 10 + extPreference(existing.ext);
    const newScore = variantRank(parsed.variantKey) * 10 + extPreference(parsed.ext);
    if (newScore < existingScore) {
      grouped.set(parsed.masterKey, { candidate, ...parsed });
    }
  }

  return [...Array.from(grouped.values()).map((entry) => entry.candidate), ...passthrough];
}

export function filterPortalCandidates(
  source: StatefoxPortalSource,
  candidates: PortalImageCandidate[],
): PortalImageCandidate[] {
  if (candidates.length === 0) return candidates;
  const predicate =
    source === "idealista"
      ? shouldKeepIdealista
      : source === "fotocasa"
        ? shouldKeepFotocasa
        : shouldKeepGeneric;
  const filtered = candidates.filter(predicate);
  const deduped = source === "idealista" ? dedupIdealistaCandidates(filtered) : filtered;
  return [...deduped].sort((a, b) => rankFor(source, a) - rankFor(source, b));
}
