import type { StatefoxPortalSource } from "@prisma/client";
import { enqueueJob } from "@/lib/job-queue";
import { getStatefoxImageImportConfig } from "./config";
import {
  buildStatefoxImageImportIdempotencyKey,
  detectPortalSource,
  normalizePortalUrl,
} from "./portal";
import { hasTerminalImageImportState, markImageImportPending } from "./repo";

export type StatefoxImageImportCandidate = {
  statefoxId: string;
  portalUrl: string | null;
};

export async function enqueueStatefoxImageImport(args: {
  statefoxId: string;
  portalUrl: string;
  source?: StatefoxPortalSource;
  maxImages?: number;
}): Promise<boolean> {
  const config = getStatefoxImageImportConfig();
  if (!config.enabled) return false;

  const portalUrl = normalizePortalUrl(args.portalUrl);
  if (!portalUrl) return false;

  const source = args.source ?? detectPortalSource(portalUrl);
  if (source === "unknown") return false;

  const terminal = await hasTerminalImageImportState({
    source,
    statefoxId: args.statefoxId,
  });
  if (terminal) return false;

  await markImageImportPending({ source, statefoxId: args.statefoxId, portalUrl });
  await enqueueJob({
    type: "IMPORT_STATEFOX_PORTAL_IMAGES",
    payload: {
      statefoxId: args.statefoxId,
      portalUrl,
      source,
      maxImages: args.maxImages ?? config.maxImages,
    },
    priority: 80,
    maxAttempts: 4,
    idempotencyKey: buildStatefoxImageImportIdempotencyKey({
      source,
      statefoxId: args.statefoxId,
    }),
  });

  return true;
}

export async function enqueueStatefoxImageImportsForComparables(
  candidates: StatefoxImageImportCandidate[],
): Promise<number> {
  let enqueued = 0;
  for (const candidate of candidates) {
    if (!candidate.portalUrl) continue;
    try {
      const ok = await enqueueStatefoxImageImport({
        statefoxId: candidate.statefoxId,
        portalUrl: candidate.portalUrl,
      });
      if (ok) enqueued++;
    } catch (err) {
      console.warn(
        `[statefox:image-cache] No se pudo encolar import para ${candidate.statefoxId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
  return enqueued;
}
