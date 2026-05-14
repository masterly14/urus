import type { StatefoxImageCacheStatus, StatefoxPortalSource } from "@prisma/client";
import { canExecute, recordFailure, recordSuccess } from "@/lib/circuit-breaker";
import type { JobRecord } from "@/lib/job-queue/types";
import { detectPortalSource } from "@/lib/statefox/image-cache";
import { getStatefoxImageImportConfig } from "@/lib/statefox/image-cache/config";
import { importStatefoxPortalImages } from "@/lib/statefox/image-cache/importer";
import { ImageWorkerClient, ImageWorkerError } from "@/lib/workers/contracts";
import type { HandlerResult } from "./types";

const RETRIABLE_STATUS = new Set<StatefoxImageCacheStatus>(["FAILED"]);
const SUPPORTED_SOURCES = new Set<StatefoxPortalSource>([
  "idealista",
  "fotocasa",
  "pisoscom",
  "habitaclia",
]);

function parseSource(value: unknown, portalUrl: string): StatefoxPortalSource {
  if (typeof value === "string" && SUPPORTED_SOURCES.has(value as StatefoxPortalSource)) {
    return value as StatefoxPortalSource;
  }
  return detectPortalSource(portalUrl);
}

export async function handleStatefoxImageImport(job: JobRecord): Promise<HandlerResult> {
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const statefoxId = typeof payload.statefoxId === "string" ? payload.statefoxId.trim() : "";
  const portalUrl = typeof payload.portalUrl === "string" ? payload.portalUrl.trim() : "";
  const maxImages = typeof payload.maxImages === "number" ? payload.maxImages : undefined;

  if (!statefoxId || !portalUrl) {
    return {
      success: false,
      error: "IMPORT_STATEFOX_PORTAL_IMAGES requiere statefoxId y portalUrl",
      permanent: true,
    };
  }

  const source = parseSource(payload.source, portalUrl);
  if (source === "unknown") {
    return {
      success: false,
      error: `Portal no soportado para ${portalUrl}`,
      permanent: true,
    };
  }

  const circuitId = `statefox-image-import:${source}`;
  const { allowed, state } = await canExecute(circuitId);
  if (!allowed) {
    return {
      success: false,
      error: `Circuit breaker OPEN para ${circuitId} (${state.failureCount} fallos consecutivos)`,
    };
  }

  // Si el image worker (Railway) está configurado, delega ahí para no
  // ejecutar Playwright en Vercel. El handler usa un deadline largo (no es
  // un request user-facing): si el worker falla con TIMEOUT/NETWORK, hace
  // fallback al import local para no perder el trabajo.
  const config = getStatefoxImageImportConfig();
  let outcome = await runViaWorkerIfConfigured({
    config,
    statefoxId,
    portalUrl,
    source,
    maxImages,
  });
  if (!outcome) {
    outcome = await importStatefoxPortalImages({
      statefoxId,
      portalUrl,
      source,
      maxImages,
    });
  }

  console.log(
    `[consumer:statefox-images] ${statefoxId} source=${source} status=${outcome.status} imported=${outcome.importedCount}/${outcome.candidateCount}`,
  );

  if (outcome.status === "IMPORTED" || !RETRIABLE_STATUS.has(outcome.status)) {
    await recordSuccess(circuitId);
    return { success: true };
  }

  const error = outcome.errorReason ?? "No se pudo importar ninguna imagen";
  await recordFailure(circuitId, error);
  return { success: false, error };
}

interface RunViaWorkerArgs {
  config: ReturnType<typeof getStatefoxImageImportConfig>;
  statefoxId: string;
  portalUrl: string;
  source: StatefoxPortalSource;
  maxImages?: number;
}

/**
 * Devuelve un outcome compatible con `importStatefoxPortalImages` si el
 * worker Railway está configurado y respondió con resultado utilizable.
 * Devuelve `null` para indicar al caller que debe ejecutar el import local.
 */
async function runViaWorkerIfConfigured(args: RunViaWorkerArgs): Promise<
  | { status: StatefoxImageCacheStatus; statefoxId: string; source: StatefoxPortalSource; importedCount: number; candidateCount: number; errorReason?: string }
  | null
> {
  const { config, statefoxId, portalUrl, source, maxImages } = args;
  if (config.workerMode === "local" || !config.workerBaseUrl || !config.workerSecret) {
    return null;
  }

  const client = new ImageWorkerClient({
    baseUrl: config.workerBaseUrl,
    secret: config.workerSecret,
    requestTimeoutMs: Math.max(60_000, config.workerRequestTimeoutMs * 4),
  });

  try {
    const response = await client.runImageImport({
      statefoxId,
      portalUrl,
      source,
      maxImages,
      // El consumer puede esperar más que el flujo síncrono de Pricing.
      deadlineMs: Math.max(45_000, config.workerSyncDeadlineMs * 8),
    });

    if (response.status === "completed") {
      return {
        status: "IMPORTED",
        statefoxId,
        source,
        importedCount: response.importedCount,
        candidateCount: response.candidateCount,
      };
    }
    if (response.status === "skipped") {
      return {
        status: "NO_IMAGES_FOUND",
        statefoxId,
        source,
        importedCount: 0,
        candidateCount: 0,
        errorReason: response.reason,
      };
    }
    if (response.status === "failed") {
      return {
        status: "FAILED",
        statefoxId,
        source,
        importedCount: 0,
        candidateCount: 0,
        errorReason: response.errorReason,
      };
    }
    // accepted: el worker delegó a su propia cola; reportamos éxito parcial
    // para no reintentar inmediatamente.
    return {
      status: "PENDING",
      statefoxId,
      source,
      importedCount: 0,
      candidateCount: 0,
      errorReason: response.reason ?? "Worker accepted (jobs encolado)",
    };
  } catch (err) {
    if (err instanceof ImageWorkerError) {
      // hybrid: caer a local. railway puro: reportar fallo (no fallback).
      if (config.workerMode === "hybrid") {
        console.warn(
          `[consumer:statefox-images] worker ${err.code}: ${err.message}; cayendo a import local`,
        );
        return null;
      }
      return {
        status: "FAILED",
        statefoxId,
        source,
        importedCount: 0,
        candidateCount: 0,
        errorReason: `worker ${err.code}: ${err.message}`,
      };
    }
    throw err;
  }
}
