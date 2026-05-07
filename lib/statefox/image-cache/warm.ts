import type { StatefoxPortalSource } from "@prisma/client";
import { getStatefoxImageImportConfig } from "./config";
import { importStatefoxPortalImages } from "./importer";
import { detectPortalSource, normalizePortalUrl } from "./portal";
import { hasTerminalImageImportState } from "./repo";

export type WarmImportCandidate = {
  statefoxId: string;
  portalUrl: string | null;
  source?: StatefoxPortalSource;
};

export type WarmImportResult = {
  attempted: number;
  imported: number;
};

export async function warmImportStatefoxImagesOnFirstSeen(
  candidates: WarmImportCandidate[],
): Promise<WarmImportResult> {
  const config = getStatefoxImageImportConfig();
  if (!config.enabled || !config.syncOnFirstSeen || config.syncMaxComparables <= 0) {
    return { attempted: 0, imported: 0 };
  }

  let attempted = 0;
  let imported = 0;
  const seen = new Set<string>();

  for (const candidate of candidates) {
    if (attempted >= config.syncMaxComparables) break;
    if (!candidate.portalUrl || seen.has(candidate.statefoxId)) continue;
    seen.add(candidate.statefoxId);

    const portalUrl = normalizePortalUrl(candidate.portalUrl);
    if (!portalUrl) continue;
    const source = candidate.source ?? detectPortalSource(portalUrl);
    if (source === "unknown") continue;

    const terminal = await hasTerminalImageImportState({
      source,
      statefoxId: candidate.statefoxId,
    });
    if (terminal) continue;

    attempted++;
    try {
      const outcome = await importStatefoxPortalImages({
        statefoxId: candidate.statefoxId,
        portalUrl,
        source,
        // El camino caliente busca disponibilidad visual inmediata; el job
        // asíncrono puede completar el resto de la galería después.
        maxImages: 1,
      });
      if (outcome.status === "IMPORTED" && outcome.importedCount > 0) {
        imported++;
      }
    } catch (err) {
      console.warn(
        `[statefox:image-cache] Warm import falló para ${candidate.statefoxId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  return { attempted, imported };
}
