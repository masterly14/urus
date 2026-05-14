import type { StatefoxImageCacheStatus, StatefoxPortalSource } from "@prisma/client";
import { getStatefoxImageImportConfig } from "./config";
import { discoverPortalImages } from "./extract";
import { buildCloudinaryPublicId, detectPortalSource, normalizePortalUrl } from "./portal";
import { recordImageImportStatus, recordImportedImage } from "./repo";
import type { StatefoxImageImportOutcome } from "./types";
import { downloadPortalImage, uploadStatefoxImageToCloudinary } from "./upload";

type NonImportedStatus = Exclude<StatefoxImageCacheStatus, "IMPORTED">;

function mapDiscoveryStatus(
  status: Awaited<ReturnType<typeof discoverPortalImages>>["status"],
): NonImportedStatus {
  switch (status) {
    case "ok":
      return "PENDING";
    case "blocked":
      return "BLOCKED";
    case "captcha":
      return "CAPTCHA";
    case "listing_removed":
      return "LISTING_REMOVED";
    case "no_images_found":
      return "NO_IMAGES_FOUND";
    case "failed":
    default:
      return "FAILED";
  }
}

export async function importStatefoxPortalImages(args: {
  statefoxId: string;
  portalUrl: string;
  source?: StatefoxPortalSource;
  maxImages?: number;
}): Promise<StatefoxImageImportOutcome> {
  const config = getStatefoxImageImportConfig();
  if (!config.enabled) {
    return {
      statefoxId: args.statefoxId,
      source: args.source ?? "unknown",
      status: "FAILED",
      importedCount: 0,
      candidateCount: 0,
      errorReason: "STATEFOX_IMAGE_IMPORT_ENABLED=false",
    };
  }

  const portalUrl = normalizePortalUrl(args.portalUrl);
  const source = args.source ?? detectPortalSource(portalUrl ?? args.portalUrl);
  if (!portalUrl || source === "unknown") {
    return {
      statefoxId: args.statefoxId,
      source,
      status: "FAILED",
      importedCount: 0,
      candidateCount: 0,
      errorReason: "Portal URL inválida o no soportada",
    };
  }

  const discovery = await discoverPortalImages(portalUrl);
  if (discovery.status !== "ok") {
    const status = mapDiscoveryStatus(discovery.status);
    await recordImageImportStatus({
      source,
      statefoxId: args.statefoxId,
      portalUrl,
      status,
      errorReason: discovery.errorReason,
    });
    return {
      statefoxId: args.statefoxId,
      source,
      status,
      importedCount: 0,
      candidateCount: discovery.candidates.length,
      errorReason: discovery.errorReason,
    };
  }

  const maxImages = Math.max(1, args.maxImages ?? config.maxImages);
  let importedCount = 0;
  let lastError: string | undefined;

  for (const candidate of discovery.candidates) {
    if (importedCount >= maxImages) break;
    try {
      const downloaded = await downloadPortalImage({
        imageUrl: candidate.url,
        portalUrl,
        userAgent: discovery.userAgent,
        cookies: discovery.cookies,
        timeoutMs: config.timeoutMs,
      });
      const publicId = buildCloudinaryPublicId({
        source,
        statefoxId: args.statefoxId,
        imageIndex: importedCount,
      });
      const uploaded = await uploadStatefoxImageToCloudinary({
        image: downloaded,
        publicId,
        tags: [source, args.statefoxId],
        context: {
          statefoxId: args.statefoxId,
          source,
          portalUrl,
          originalImageUrl: downloaded.url,
        },
      });
      await recordImportedImage({
        source,
        statefoxId: args.statefoxId,
        portalUrl,
        imageIndex: importedCount,
        originalImageUrl: downloaded.url,
        originalImageSha256: downloaded.sha256,
        cloudinaryPublicId: uploaded.publicId,
        cloudinarySecureUrl: uploaded.secureUrl,
        width: uploaded.width ?? candidate.width,
        height: uploaded.height ?? candidate.height,
        bytes: uploaded.bytes || downloaded.bytes,
        format: uploaded.format ?? downloaded.format,
      });
      importedCount++;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  if (importedCount === 0) {
    await recordImageImportStatus({
      source,
      statefoxId: args.statefoxId,
      portalUrl,
      status: "FAILED",
      errorReason: lastError ?? "No se pudo descargar/subir ninguna imagen candidata",
    });
    return {
      statefoxId: args.statefoxId,
      source,
      status: "FAILED",
      importedCount: 0,
      candidateCount: discovery.candidates.length,
      errorReason: lastError,
    };
  }

  return {
    statefoxId: args.statefoxId,
    source,
    status: "IMPORTED",
    importedCount,
    candidateCount: discovery.candidates.length,
  };
}
