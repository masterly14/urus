/**
 * Lógica del Image Worker para Railway, separada del transporte HTTP para
 * que pueda testearse de forma independiente.
 *
 * Responsabilidades:
 *  - Validar y autenticar el request (`X-Worker-Secret`).
 *  - Limitar concurrencia (no saturar Bright Data / Cloudinary).
 *  - Honrar el `deadlineMs` lógico: si la importación supera la ventana
 *    síncrona, el worker responde `accepted` y deja un job idempotente en
 *    cola para que el consumer lo finalice (no se pierde trabajo).
 *  - Mantener métricas básicas para `GET /internal/health`.
 */

import {
  IMAGE_WORKER_AUTH_HEADER,
  type ImageWorkerHealthResponse,
  type ImageWorkerRunRequest,
  type ImageWorkerRunResponse,
} from "@/lib/workers/contracts";
import {
  detectPortalSource,
  enqueueStatefoxImageImport,
  getImportedImagesByStatefoxIds,
  hasTerminalImageImportState,
  importStatefoxPortalImages,
  normalizePortalUrl,
  toCloudinaryUrls,
} from "@/lib/statefox/image-cache";
import type { StatefoxPortalSource } from "@prisma/client";

export interface ImageWorkerRuntimeOptions {
  secret: string;
  /** Máximo de imports concurrentes (protege Bright Data/Cloudinary). */
  concurrency?: number;
  /** Tiempo máximo (ms) que el worker espera al import antes de devolver accepted. */
  defaultDeadlineMs?: number;
}

export interface ImageWorkerRuntimeMetrics {
  startedAt: number;
  inFlight: number;
  processed: number;
  failed: number;
  accepted: number;
  skipped: number;
}

const DEFAULT_CONCURRENCY = 2;
const DEFAULT_DEADLINE_MS = 4_500;

export class ImageWorkerRuntime {
  private readonly secret: string;
  private readonly concurrency: number;
  private readonly defaultDeadlineMs: number;
  private readonly metrics: ImageWorkerRuntimeMetrics;
  private active = 0;

  constructor(options: ImageWorkerRuntimeOptions) {
    if (!options.secret) {
      throw new Error("ImageWorkerRuntime requiere un secret compartido");
    }
    this.secret = options.secret;
    this.concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
    this.defaultDeadlineMs = Math.max(500, options.defaultDeadlineMs ?? DEFAULT_DEADLINE_MS);
    this.metrics = {
      startedAt: Date.now(),
      inFlight: 0,
      processed: 0,
      failed: 0,
      accepted: 0,
      skipped: 0,
    };
  }

  isAuthorized(headerValue: string | undefined | null): boolean {
    return Boolean(headerValue) && headerValue === this.secret;
  }

  authHeaderName(): string {
    return IMAGE_WORKER_AUTH_HEADER;
  }

  health(): ImageWorkerHealthResponse {
    return {
      status: "ok",
      uptimeSeconds: Math.round((Date.now() - this.metrics.startedAt) / 1000),
      inFlight: this.metrics.inFlight,
      processed: this.metrics.processed,
      failed: this.metrics.failed,
    };
  }

  metricsSnapshot(): ImageWorkerRuntimeMetrics {
    return { ...this.metrics };
  }

  validatePayload(payload: unknown): {
    ok: true;
    data: ImageWorkerRunRequest & { source: StatefoxPortalSource; portalUrl: string };
  } | { ok: false; status: number; error: string } {
    if (!payload || typeof payload !== "object") {
      return { ok: false, status: 400, error: "Payload inválido" };
    }
    const obj = payload as Record<string, unknown>;
    const statefoxId = typeof obj.statefoxId === "string" ? obj.statefoxId.trim() : "";
    const portalUrlRaw = typeof obj.portalUrl === "string" ? obj.portalUrl.trim() : "";
    if (!statefoxId || !portalUrlRaw) {
      return { ok: false, status: 400, error: "statefoxId y portalUrl son obligatorios" };
    }
    const portalUrl = normalizePortalUrl(portalUrlRaw) ?? portalUrlRaw;
    const sourceCandidate = typeof obj.source === "string" ? obj.source : detectPortalSource(portalUrl);
    if (sourceCandidate === "unknown") {
      return { ok: false, status: 422, error: "Portal no soportado" };
    }
    return {
      ok: true,
      data: {
        statefoxId,
        portalUrl,
        source: sourceCandidate as StatefoxPortalSource,
        maxImages: typeof obj.maxImages === "number" ? obj.maxImages : undefined,
        deadlineMs: typeof obj.deadlineMs === "number" ? obj.deadlineMs : undefined,
        traceId: typeof obj.traceId === "string" ? obj.traceId : undefined,
      },
    };
  }

  async runImageImport(
    payload: ImageWorkerRunRequest & { source: StatefoxPortalSource; portalUrl: string },
  ): Promise<ImageWorkerRunResponse> {
    const { statefoxId, portalUrl, source, traceId } = payload;
    const deadlineMs = Math.max(50, payload.deadlineMs ?? this.defaultDeadlineMs);
    const maxImages = payload.maxImages;
    const startedAt = Date.now();

    const isTerminal = await hasTerminalImageImportState({ source, statefoxId });
    if (isTerminal) {
      const cached = await getImportedImagesByStatefoxIds([statefoxId]);
      const cachedUrls = toCloudinaryUrls(cached.get(statefoxId) ?? []);
      this.metrics.skipped++;
      if (cachedUrls.length > 0) {
        this.metrics.processed++;
        return {
          status: "completed",
          statefoxId,
          source,
          importedCount: cachedUrls.length,
          candidateCount: cachedUrls.length,
          cachedUrls,
          elapsedMs: Date.now() - startedAt,
          traceId,
        };
      }
      return {
        status: "skipped",
        statefoxId,
        source,
        reason: "Estado terminal previo sin imágenes",
        traceId,
      };
    }

    if (this.active >= this.concurrency) {
      const enqueued = await this.enqueueAsync(statefoxId, portalUrl, source);
      this.metrics.accepted++;
      return {
        status: "accepted",
        statefoxId,
        source,
        reason: enqueued
          ? `concurrency limit (${this.concurrency}); job encolado`
          : "concurrency limit; no se pudo encolar",
        traceId,
      };
    }

    this.active++;
    this.metrics.inFlight = this.active;
    try {
      const racing = Promise.race([
        importStatefoxPortalImages({
          statefoxId,
          portalUrl,
          source,
          maxImages,
        }).then((outcome) => ({ kind: "done" as const, outcome })),
        new Promise<{ kind: "deadline" }>((resolve) => {
          setTimeout(() => resolve({ kind: "deadline" }), deadlineMs);
        }),
      ]);
      const raced = await racing;

      if (raced.kind === "deadline") {
        // Encola para que el consumer termine y devuelve accepted; el work
        // sigue corriendo en background en este proceso pero ya no bloquea
        // al cliente.
        const enqueued = await this.enqueueAsync(statefoxId, portalUrl, source);
        this.metrics.accepted++;
        return {
          status: "accepted",
          statefoxId,
          source,
          reason: enqueued
            ? `deadline ${deadlineMs}ms excedido; job encolado`
            : `deadline ${deadlineMs}ms excedido; encolado falló`,
          traceId,
        };
      }

      const outcome = raced.outcome;
      if (outcome.status === "IMPORTED") {
        this.metrics.processed++;
        const cached = await getImportedImagesByStatefoxIds([statefoxId]);
        const cachedUrls = toCloudinaryUrls(cached.get(statefoxId) ?? []);
        return {
          status: "completed",
          statefoxId,
          source,
          importedCount: outcome.importedCount,
          candidateCount: outcome.candidateCount,
          cachedUrls,
          elapsedMs: Date.now() - startedAt,
          traceId,
        };
      }

      this.metrics.failed++;
      return {
        status: "failed",
        statefoxId,
        source,
        errorReason: outcome.errorReason ?? `Import status=${outcome.status}`,
        errorCode: outcome.status,
        traceId,
      };
    } catch (err) {
      this.metrics.failed++;
      return {
        status: "failed",
        statefoxId,
        source,
        errorReason: err instanceof Error ? err.message : String(err),
        traceId,
      };
    } finally {
      this.active = Math.max(0, this.active - 1);
      this.metrics.inFlight = this.active;
    }
  }

  private async enqueueAsync(
    statefoxId: string,
    portalUrl: string,
    source: StatefoxPortalSource,
  ): Promise<boolean> {
    try {
      return await enqueueStatefoxImageImport({ statefoxId, portalUrl, source });
    } catch (err) {
      console.warn(
        `[image-worker] enqueue async falló statefoxId=${statefoxId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }
}
