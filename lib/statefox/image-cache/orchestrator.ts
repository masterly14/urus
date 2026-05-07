/**
 * Orquestador híbrido rápido para Statefox image cache.
 *
 * Decide para cada comparable cómo recuperar imágenes:
 *
 *  - mode=local: ejecuta `warmImportStatefoxImagesOnFirstSeen` en proceso
 *    (path histórico, útil cuando no hay worker Railway disponible).
 *
 *  - mode=railway/hybrid: llama al worker Railway con una ventana síncrona
 *    corta (`workerSyncDeadlineMs`). Si responde `completed`, las imágenes
 *    ya están en cache. Si no, devuelve `accepted` o lanza TIMEOUT y se
 *    encola un job idempotente para que termine de poblar la galería.
 */

import { randomUUID } from "crypto";
import {
  ImageWorkerClient,
  ImageWorkerError,
  type ImageWorkerRunResponse,
} from "@/lib/workers/contracts";
import type { StatefoxImageImportConfig } from "./config";
import { getStatefoxImageImportConfig } from "./config";
import { enqueueStatefoxImageImport } from "./enqueue";
import { detectPortalSource, normalizePortalUrl } from "./portal";
import { hasTerminalImageImportState } from "./repo";
import { warmImportStatefoxImagesOnFirstSeen } from "./warm";

export type ImageOrchestratorAttemptStatus =
  | "completed"
  | "accepted"
  | "skipped"
  | "failed"
  | "queued";

export interface ImageOrchestratorCandidate {
  statefoxId: string;
  portalUrl: string | null;
}

export interface ImageOrchestratorAttempt {
  statefoxId: string;
  status: ImageOrchestratorAttemptStatus;
  importedCount: number;
  reason?: string;
  traceId: string;
}

export interface ImageOrchestratorResult {
  mode: StatefoxImageImportConfig["workerMode"];
  attempts: ImageOrchestratorAttempt[];
  importedCount: number;
  acceptedCount: number;
  queuedCount: number;
  failedCount: number;
}

interface OrchestratorDeps {
  config: StatefoxImageImportConfig;
  client?: ImageWorkerClient;
}

function shouldUseWorker(config: StatefoxImageImportConfig): boolean {
  if (config.workerMode === "local") return false;
  if (!config.workerBaseUrl || !config.workerSecret) return false;
  return true;
}

function buildClient(config: StatefoxImageImportConfig): ImageWorkerClient | undefined {
  if (!config.workerBaseUrl || !config.workerSecret) return undefined;
  return new ImageWorkerClient({
    baseUrl: config.workerBaseUrl,
    secret: config.workerSecret,
    requestTimeoutMs: config.workerRequestTimeoutMs,
  });
}

function summarize(attempts: ImageOrchestratorAttempt[]): Omit<ImageOrchestratorResult, "mode" | "attempts"> {
  let importedCount = 0;
  let acceptedCount = 0;
  let queuedCount = 0;
  let failedCount = 0;
  for (const attempt of attempts) {
    if (attempt.status === "completed") importedCount += attempt.importedCount;
    if (attempt.status === "accepted") acceptedCount++;
    if (attempt.status === "queued") queuedCount++;
    if (attempt.status === "failed") failedCount++;
  }
  return { importedCount, acceptedCount, queuedCount, failedCount };
}

async function preflight(candidate: ImageOrchestratorCandidate): Promise<{
  ok: boolean;
  reason?: string;
  portalUrl?: string;
  source?: ReturnType<typeof detectPortalSource>;
}> {
  if (!candidate.portalUrl) return { ok: false, reason: "Sin portalUrl" };
  const portalUrl = normalizePortalUrl(candidate.portalUrl);
  if (!portalUrl) return { ok: false, reason: "Portal URL inválida" };
  const source = detectPortalSource(portalUrl);
  if (source === "unknown") return { ok: false, reason: "Portal no soportado" };
  const terminal = await hasTerminalImageImportState({ source, statefoxId: candidate.statefoxId });
  if (terminal) return { ok: false, reason: "Estado terminal previo" };
  return { ok: true, portalUrl, source };
}

async function runViaWorker(
  client: ImageWorkerClient,
  candidate: ImageOrchestratorCandidate,
  config: StatefoxImageImportConfig,
  preflightInfo: { portalUrl: string; source: ReturnType<typeof detectPortalSource> },
): Promise<ImageOrchestratorAttempt> {
  const traceId = randomUUID();
  try {
    const response: ImageWorkerRunResponse = await client.runImageImport({
      statefoxId: candidate.statefoxId,
      portalUrl: preflightInfo.portalUrl,
      source: preflightInfo.source as Exclude<typeof preflightInfo.source, "unknown">,
      maxImages: config.maxImages,
      deadlineMs: config.workerSyncDeadlineMs,
      traceId,
      requestTimeoutMs: config.workerRequestTimeoutMs,
    });

    if (response.status === "completed") {
      return {
        statefoxId: candidate.statefoxId,
        status: "completed",
        importedCount: response.importedCount,
        traceId,
      };
    }
    if (response.status === "accepted") {
      return {
        statefoxId: candidate.statefoxId,
        status: "accepted",
        importedCount: 0,
        reason: response.reason,
        traceId,
      };
    }
    if (response.status === "skipped") {
      return {
        statefoxId: candidate.statefoxId,
        status: "skipped",
        importedCount: 0,
        reason: response.reason,
        traceId,
      };
    }
    return {
      statefoxId: candidate.statefoxId,
      status: "failed",
      importedCount: 0,
      reason: response.errorReason,
      traceId,
    };
  } catch (err) {
    if (err instanceof ImageWorkerError) {
      const queueable = err.code === "TIMEOUT" || err.code === "NETWORK" || err.code === "BAD_RESPONSE";
      const enqueued = await enqueueFallbackJob(candidate, preflightInfo);
      return {
        statefoxId: candidate.statefoxId,
        status: queueable && enqueued ? "queued" : "failed",
        importedCount: 0,
        reason: `${err.code}: ${err.message}`,
        traceId,
      };
    }
    return {
      statefoxId: candidate.statefoxId,
      status: "failed",
      importedCount: 0,
      reason: err instanceof Error ? err.message : String(err),
      traceId,
    };
  }
}

async function enqueueFallbackJob(
  candidate: ImageOrchestratorCandidate,
  preflightInfo: { portalUrl: string; source: ReturnType<typeof detectPortalSource> },
): Promise<boolean> {
  if (preflightInfo.source === "unknown") return false;
  try {
    return await enqueueStatefoxImageImport({
      statefoxId: candidate.statefoxId,
      portalUrl: preflightInfo.portalUrl,
      source: preflightInfo.source,
    });
  } catch (err) {
    console.warn(
      `[image-orchestrator] enqueue fallback falló para ${candidate.statefoxId}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}

export async function runHybridImageImport(
  candidates: ImageOrchestratorCandidate[],
  deps: Partial<OrchestratorDeps> = {},
): Promise<ImageOrchestratorResult> {
  const config = deps.config ?? getStatefoxImageImportConfig();
  const useWorker = shouldUseWorker(config);
  const client = useWorker ? deps.client ?? buildClient(config) : undefined;
  const attempts: ImageOrchestratorAttempt[] = [];
  const filtered: Array<ImageOrchestratorCandidate & { portalUrl: string }> = [];

  for (const candidate of candidates) {
    const pre = await preflight(candidate);
    if (!pre.ok || !pre.portalUrl || !pre.source) {
      attempts.push({
        statefoxId: candidate.statefoxId,
        status: "skipped",
        importedCount: 0,
        reason: pre.reason,
        traceId: randomUUID(),
      });
      continue;
    }

    if (useWorker && client) {
      const attempt = await runViaWorker(client, candidate, config, {
        portalUrl: pre.portalUrl,
        source: pre.source,
      });
      attempts.push(attempt);
      if (attempt.status === "completed" || attempt.status === "accepted" || attempt.status === "queued") {
        continue;
      }
      // En modo hybrid, si el worker falló de forma no recuperable, intenta local.
      if (config.workerMode === "hybrid") {
        filtered.push({ ...candidate, portalUrl: pre.portalUrl });
      }
    } else {
      filtered.push({ ...candidate, portalUrl: pre.portalUrl });
    }
  }

  // En modo local SIEMPRE caemos al warm import. En modo hybrid, solo si el
  // worker no estaba disponible o falló de forma no recuperable. En modo
  // railway puro, si el worker no está configurado tratamos esto como local
  // (degradación segura) en lugar de quedarnos sin imágenes.
  const fallbackEnabled =
    config.workerMode === "local" || config.workerMode === "hybrid" || !useWorker;
  if (filtered.length > 0 && fallbackEnabled) {
    const local = await warmImportStatefoxImagesOnFirstSeen(
      filtered.map((c) => ({ statefoxId: c.statefoxId, portalUrl: c.portalUrl })),
    );
    if (local.imported > 0) {
      attempts.push({
        statefoxId: `local-warm-${filtered.length}`,
        status: "completed",
        importedCount: local.imported,
        traceId: randomUUID(),
        reason: `Warm import local cubrió ${local.imported}/${local.attempted}`,
      });
    }
  }

  return {
    mode: config.workerMode,
    attempts,
    ...summarize(attempts),
  };
}
