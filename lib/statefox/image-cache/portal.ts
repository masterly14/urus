import type { StatefoxPortalSource } from "@prisma/client";

export function detectPortalSource(portalUrl: string | null | undefined): StatefoxPortalSource {
  if (!portalUrl) return "unknown";
  try {
    const host = new URL(portalUrl).hostname.toLowerCase();
    if (host.includes("idealista.")) return "idealista";
    if (host.includes("fotocasa.")) return "fotocasa";
    if (host.includes("pisos.")) return "pisoscom";
    if (host.includes("habitaclia.")) return "habitaclia";
  } catch {
    return "unknown";
  }
  return "unknown";
}

export function normalizePortalUrl(portalUrl: string): string | null {
  try {
    const url = new URL(portalUrl.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function buildStatefoxImageImportIdempotencyKey(args: {
  source: StatefoxPortalSource;
  statefoxId: string;
}): string {
  return `statefox-image-import:${args.source}:${args.statefoxId}`;
}

export function buildCloudinaryPublicId(args: {
  source: StatefoxPortalSource;
  statefoxId: string;
  imageIndex: number;
}): string {
  const safeStatefoxId = args.statefoxId.replace(/[^a-zA-Z0-9_-]+/g, "_");
  return `statefox/${args.source}/${safeStatefoxId}/${args.imageIndex}`;
}
