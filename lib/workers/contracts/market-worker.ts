/**
 * Contrato HTTP del Market Worker (Railway).
 *
 * Define la superficie pública que la app principal (Vercel) usa para
 * delegar la captura de listings de portales inmobiliarios al Worker
 * dedicado. El Worker es estado externo: vive en `workers/market-worker/`
 * y se despliega independientemente.
 *
 * Mismo patrón que `image-worker.ts`:
 *   - Constantes de paths y headers compartidas entre cliente y server.
 *   - Tipos discriminados de respuesta (completed | accepted | blocked | failed).
 *   - Error tipado para que el orquestador de la app sepa qué reintentar.
 *
 * Ver:
 *   - docs/core-sistema-mercado-plan-implementacion.md (Fase 2)
 *   - .cursor/plans/fase_2_worker_fotocasa_*.plan.md
 */

import type { MarketOperation, MarketSource } from "@/lib/market";

export const MARKET_WORKER_CRAWL_SEED_PATH = "/internal/market/crawl/seed";
export const MARKET_WORKER_CRAWL_DETAIL_PATH = "/internal/market/crawl/detail";
export const MARKET_WORKER_HEALTH_PATH = "/internal/health";

export const MARKET_WORKER_AUTH_HEADER = "x-worker-secret";
export const MARKET_WORKER_TRACE_HEADER = "x-trace-id";

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

/**
 * Solicitud para que el Worker procese un seed concreto.
 *
 * Importante: la app crea `MarketCrawlRun` en estado RUNNING antes de
 * llamar al Worker. El Worker solo actualiza el run; nunca lo crea. Esto
 * garantiza que el lifecycle del run sea visible desde la app aunque el
 * Worker esté caído.
 */
export interface MarketCrawlSeedRequest {
  /** ID del MarketCrawlRun ya creado por la app. */
  runId: string;
  /** ID del MarketSeed que se está procesando. */
  seedId: string;
  /** Portal de origen (V1 solo Fotocasa, mapeado a `source_a`). */
  source: MarketSource;
  /** Operación: V1 solo `sale`. */
  operation: MarketOperation;
  /** URL del listado paginable (de MarketSeed.url). */
  url: string;
  /** Cursor opcional de continuación (para reanudar paginación). */
  cursor?: string | null;
  /** Tiempo máximo de extracción (ms). El Worker lo respeta como tope global. */
  budgetMs: number;
  /** Máximo de requests HTTP que el Worker puede hacer en este run. */
  budgetRequests: number;
  /**
   * Tiempo máximo (ms) que el cliente espera de forma síncrona.
   * Si el Worker no termina en `deadlineMs`, devuelve `accepted` y
   * sigue persistiendo en background.
   */
  deadlineMs?: number;
  /** Identificador para correlacionar logs Vercel↔Railway. */
  traceId: string;
}

/**
 * Solicitud para capturar ficha de detalle de un listing concreto.
 * Se usa en Captación Fase 2 para intentar resolver teléfonos reales de
 * particulares en su primera aparición.
 */
export interface MarketCrawlDetailRequest {
  source: MarketSource;
  canonicalUrl: string;
  externalId?: string | null;
  timeoutMs?: number;
  traceId: string;
}

// ---------------------------------------------------------------------------
// Response (discriminada)
// ---------------------------------------------------------------------------

export type MarketCrawlSeedStatus = "completed" | "accepted" | "blocked" | "failed";

export interface MarketCrawlSeedCompletedResponse {
  status: "completed";
  runId: string;
  itemsCaptured: number;
  itemsRejected: number;
  pagesScanned: number;
  cursorOut?: string | null;
  elapsedMs: number;
  traceId: string;
}

export interface MarketCrawlSeedAcceptedResponse {
  status: "accepted";
  runId: string;
  reason: "DEADLINE_EXCEEDED" | "CONCURRENCY_LIMIT";
  traceId: string;
}

export interface MarketCrawlSeedBlockedResponse {
  status: "blocked";
  runId: string;
  reason: string;
  traceId: string;
}

export interface MarketCrawlSeedFailedResponse {
  status: "failed";
  runId: string;
  errorCode: string;
  errorReason: string;
  traceId: string;
}

export type MarketCrawlSeedResponse =
  | MarketCrawlSeedCompletedResponse
  | MarketCrawlSeedAcceptedResponse
  | MarketCrawlSeedBlockedResponse
  | MarketCrawlSeedFailedResponse;

export interface MarketCrawlDetailCompletedResponse {
  status: "completed";
  source: MarketSource;
  canonicalUrl: string;
  phones: string[];
  advertiserName: string | null;
  advertiserType: "particular" | "agency" | null;
  /** Descripcion completa del anuncio (no la version truncada del listado). */
  description: string | null;
  /** URLs originales del portal de TODAS las fotos del inmueble. */
  imageUrls: string[];
  /** Codigo interno del anunciante en el portal (ej. "VES250414SM"). */
  listingReference: string | null;
  /** Referencia catastral oficial espanola (20 chars). Solo si el anunciante la incluye. */
  cadastralRef: string | null;
  /** True si el worker logro ejecutar el click "Ver telefono". */
  clickedRevealPhone: boolean;
  httpStatus: number | null;
  strategy: string | null;
  traceId: string;
}

export interface MarketCrawlDetailBlockedResponse {
  status: "blocked";
  reason: string;
  traceId: string;
}

export interface MarketCrawlDetailFailedResponse {
  status: "failed";
  errorCode: string;
  errorReason: string;
  traceId: string;
}

export type MarketCrawlDetailResponse =
  | MarketCrawlDetailCompletedResponse
  | MarketCrawlDetailBlockedResponse
  | MarketCrawlDetailFailedResponse;

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export interface MarketWorkerHealthResponse {
  status: "ok" | "degraded";
  uptimeSeconds: number;
  inFlight: number;
  processed: number;
  failed: number;
  version?: string;
}

// ---------------------------------------------------------------------------
// Errores tipados del cliente
// ---------------------------------------------------------------------------

/**
 * Errores tipados del cliente. El orquestador de la app los traduce a
 * estados de `MarketCrawlRun` (FAILED transitorio vs permanente) y a
 * estado del circuit breaker por fuente.
 */
export class MarketWorkerError extends Error {
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
    code: MarketWorkerError["code"],
    message: string,
    httpStatus?: number,
  ) {
    super(message);
    this.name = "MarketWorkerError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

/** Códigos retornables por el Worker en el estado `failed`. */
export const MARKET_WORKER_FAILED_CODES = {
  EXTRACTOR_ERROR: "EXTRACTOR_ERROR",
  RUN_NOT_FOUND: "RUN_NOT_FOUND",
  PERSIST_ERROR: "PERSIST_ERROR",
  INTERNAL: "INTERNAL",
} as const;

export type MarketWorkerFailedCode =
  (typeof MARKET_WORKER_FAILED_CODES)[keyof typeof MARKET_WORKER_FAILED_CODES];
