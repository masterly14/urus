/**
 * Contrato HTTP del Image Worker (Railway).
 *
 * Permite que la API en Vercel delegue el discovery + descarga + upload de
 * imágenes Statefox a un worker dedicado en Railway, manteniendo respuesta
 * inmediata si completa en una ventana corta (modo híbrido).
 */

import type { StatefoxPortalSource } from "@prisma/client";

export const IMAGE_WORKER_RUN_PATH = "/internal/image-import/run";
export const IMAGE_WORKER_HEALTH_PATH = "/internal/health";

/**
 * Payload aceptado por el worker. `traceId` y `deadlineMs` son opcionales
 * pero se recomiendan para trazabilidad y respeto del SLA en la ventana
 * síncrona.
 */
export interface ImageWorkerRunRequest {
  statefoxId: string;
  portalUrl: string;
  source?: StatefoxPortalSource;
  maxImages?: number;
  /** Tiempo máximo (ms) que el cliente espera de forma síncrona. */
  deadlineMs?: number;
  /** Identificador opcional para correlacionar logs Vercel↔Railway. */
  traceId?: string;
}

export type ImageWorkerStatus =
  | "completed"
  | "accepted"
  | "skipped"
  | "failed";

export interface ImageWorkerCompletedResponse {
  status: "completed";
  statefoxId: string;
  source: StatefoxPortalSource;
  importedCount: number;
  candidateCount: number;
  cachedUrls: string[];
  elapsedMs: number;
  traceId?: string;
}

export interface ImageWorkerAcceptedResponse {
  status: "accepted";
  statefoxId: string;
  source: StatefoxPortalSource;
  jobId?: string;
  reason?: string;
  traceId?: string;
}

export interface ImageWorkerSkippedResponse {
  status: "skipped";
  statefoxId: string;
  source: StatefoxPortalSource;
  reason: string;
  traceId?: string;
}

export interface ImageWorkerFailedResponse {
  status: "failed";
  statefoxId: string;
  source: StatefoxPortalSource;
  errorReason: string;
  errorCode?: string;
  traceId?: string;
}

export type ImageWorkerRunResponse =
  | ImageWorkerCompletedResponse
  | ImageWorkerAcceptedResponse
  | ImageWorkerSkippedResponse
  | ImageWorkerFailedResponse;

export interface ImageWorkerHealthResponse {
  status: "ok" | "degraded";
  uptimeSeconds: number;
  inFlight: number;
  processed: number;
  failed: number;
  workerMode?: string;
  version?: string;
}

export const IMAGE_WORKER_AUTH_HEADER = "x-worker-secret";
export const IMAGE_WORKER_TRACE_HEADER = "x-trace-id";

/**
 * Errores tipados del cliente. El orquestador los traduce a estados de cache.
 */
export class ImageWorkerError extends Error {
  public readonly code:
    | "DISABLED"
    | "MISCONFIGURED"
    | "TIMEOUT"
    | "UNAUTHORIZED"
    | "BAD_RESPONSE"
    | "NETWORK"
    | "REJECTED";
  public readonly httpStatus?: number;

  constructor(
    code: ImageWorkerError["code"],
    message: string,
    httpStatus?: number,
  ) {
    super(message);
    this.name = "ImageWorkerError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}
