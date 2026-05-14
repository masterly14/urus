/**
 * Cliente HTTP para llamar al Market Worker desde la app principal.
 *
 * Espejo del `ImageWorkerClient` (mismo timeout, mismo manejo de errores
 * tipados). El orquestador de crons lo usa para delegar la captura de
 * un seed concreto al Worker de Railway.
 *
 * Convenciones:
 *   - Lee siempre `baseUrl` y `secret` de env (no se hardcodean).
 *   - Aborta el request si pasa `requestTimeoutMs` (default 8s).
 *   - Traduce errores a `MarketWorkerError` con `code` para que el
 *     consumidor decida reintento/circuit breaker.
 */

import {
  MARKET_WORKER_AUTH_HEADER,
  MARKET_WORKER_CRAWL_DETAIL_PATH,
  MARKET_WORKER_CRAWL_SEED_PATH,
  MARKET_WORKER_HEALTH_PATH,
  MARKET_WORKER_TRACE_HEADER,
  type MarketCrawlDetailRequest,
  type MarketCrawlDetailResponse,
  MarketWorkerError,
  type MarketCrawlSeedRequest,
  type MarketCrawlSeedResponse,
  type MarketWorkerHealthResponse,
} from "./market-worker";

export interface MarketWorkerClientOptions {
  baseUrl: string;
  secret: string;
  /** Timeout HTTP del request (ms). Independiente del `deadlineMs` lógico. */
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface CallMarketWorkerOptions extends MarketCrawlSeedRequest {
  /** Override puntual del timeout HTTP. */
  requestTimeoutMs?: number;
}

export interface CallMarketWorkerDetailOptions extends MarketCrawlDetailRequest {
  requestTimeoutMs?: number;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 8_000;

function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, "");
}

export class MarketWorkerClient {
  private readonly baseUrl: string;
  private readonly secret: string;
  private readonly requestTimeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: MarketWorkerClientOptions) {
    if (!options.baseUrl) {
      throw new MarketWorkerError("MISCONFIGURED", "MarketWorkerClient requiere baseUrl");
    }
    if (!options.secret) {
      throw new MarketWorkerError("MISCONFIGURED", "MarketWorkerClient requiere secret compartido");
    }
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.secret = options.secret;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /**
   * Pide al Worker procesar un seed concreto. La app debe haber creado el
   * `MarketCrawlRun` antes de invocar este método.
   */
  async runCrawlSeed(input: CallMarketWorkerOptions): Promise<MarketCrawlSeedResponse> {
    const controller = new AbortController();
    const timeoutMs = Math.max(1_000, input.requestTimeoutMs ?? this.requestTimeoutMs);
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const body = JSON.stringify({
      runId: input.runId,
      seedId: input.seedId,
      source: input.source,
      operation: input.operation,
      url: input.url,
      cursor: input.cursor ?? null,
      budgetMs: input.budgetMs,
      budgetRequests: input.budgetRequests,
      deadlineMs: input.deadlineMs,
      traceId: input.traceId,
    } satisfies MarketCrawlSeedRequest);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${MARKET_WORKER_CRAWL_SEED_PATH}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          [MARKET_WORKER_AUTH_HEADER]: this.secret,
          [MARKET_WORKER_TRACE_HEADER]: input.traceId,
        },
        body,
        signal: controller.signal,
      });

      if (response.status === 401 || response.status === 403) {
        throw new MarketWorkerError(
          "UNAUTHORIZED",
          `Worker rechazó la autenticación (HTTP ${response.status})`,
          response.status,
        );
      }

      const text = await response.text();
      let parsed: unknown = null;
      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new MarketWorkerError(
            "BAD_RESPONSE",
            `Respuesta del worker no es JSON válido (HTTP ${response.status})`,
            response.status,
          );
        }
      }

      if (!response.ok) {
        const message =
          parsed && typeof parsed === "object" && "errorReason" in parsed
            ? String((parsed as Record<string, unknown>).errorReason)
            : `HTTP ${response.status}`;
        throw new MarketWorkerError("REJECTED", message, response.status);
      }

      if (!isCrawlSeedResponse(parsed)) {
        throw new MarketWorkerError(
          "BAD_RESPONSE",
          "Respuesta del worker no cumple el contrato esperado",
          response.status,
        );
      }
      return parsed;
    } catch (err) {
      if (err instanceof MarketWorkerError) throw err;
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new MarketWorkerError("TIMEOUT", `Worker no respondió en ${timeoutMs}ms`);
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new MarketWorkerError("NETWORK", message);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Pide al Worker una captura de detalle para intentar extraer teléfonos
   * del anunciante (Fase 2 de Captación).
   */
  async runCrawlDetail(
    input: CallMarketWorkerDetailOptions,
  ): Promise<MarketCrawlDetailResponse> {
    const controller = new AbortController();
    const timeoutMs = Math.max(1_000, input.requestTimeoutMs ?? this.requestTimeoutMs);
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const body = JSON.stringify({
      source: input.source,
      canonicalUrl: input.canonicalUrl,
      externalId: input.externalId ?? null,
      timeoutMs: input.timeoutMs,
      traceId: input.traceId,
    } satisfies MarketCrawlDetailRequest);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${MARKET_WORKER_CRAWL_DETAIL_PATH}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          [MARKET_WORKER_AUTH_HEADER]: this.secret,
          [MARKET_WORKER_TRACE_HEADER]: input.traceId,
        },
        body,
        signal: controller.signal,
      });

      if (response.status === 401 || response.status === 403) {
        throw new MarketWorkerError(
          "UNAUTHORIZED",
          `Worker rechazó la autenticación (HTTP ${response.status})`,
          response.status,
        );
      }

      const text = await response.text();
      let parsed: unknown = null;
      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new MarketWorkerError(
            "BAD_RESPONSE",
            `Respuesta del worker no es JSON válido (HTTP ${response.status})`,
            response.status,
          );
        }
      }

      if (!response.ok) {
        const message =
          parsed && typeof parsed === "object" && "errorReason" in parsed
            ? String((parsed as Record<string, unknown>).errorReason)
            : `HTTP ${response.status}`;
        throw new MarketWorkerError("REJECTED", message, response.status);
      }

      if (!isCrawlDetailResponse(parsed)) {
        throw new MarketWorkerError(
          "BAD_RESPONSE",
          "Respuesta de detalle no cumple el contrato esperado",
          response.status,
        );
      }
      return parsed;
    } catch (err) {
      if (err instanceof MarketWorkerError) throw err;
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new MarketWorkerError("TIMEOUT", `Worker no respondió en ${timeoutMs}ms`);
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new MarketWorkerError("NETWORK", message);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Llama al endpoint de health del Worker. Útil para `/api/market/health`. */
  async health(options?: { requestTimeoutMs?: number }): Promise<MarketWorkerHealthResponse> {
    const controller = new AbortController();
    const timeoutMs = Math.max(500, options?.requestTimeoutMs ?? this.requestTimeoutMs);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${MARKET_WORKER_HEALTH_PATH}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          [MARKET_WORKER_AUTH_HEADER]: this.secret,
        },
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) {
        throw new MarketWorkerError("UNAUTHORIZED", `Health rechazó auth (HTTP ${response.status})`, response.status);
      }
      const text = await response.text();
      const parsed = text ? JSON.parse(text) : null;
      if (!isHealthResponse(parsed)) {
        throw new MarketWorkerError("BAD_RESPONSE", "Health no cumple contrato", response.status);
      }
      return parsed;
    } catch (err) {
      if (err instanceof MarketWorkerError) throw err;
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new MarketWorkerError("TIMEOUT", `Health no respondió en ${timeoutMs}ms`);
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new MarketWorkerError("NETWORK", message);
    } finally {
      clearTimeout(timer);
    }
  }
}

function isCrawlSeedResponse(value: unknown): value is MarketCrawlSeedResponse {
  if (!value || typeof value !== "object") return false;
  const status = (value as Record<string, unknown>).status;
  return status === "completed" || status === "accepted" || status === "blocked" || status === "failed";
}

function isCrawlDetailResponse(value: unknown): value is MarketCrawlDetailResponse {
  if (!value || typeof value !== "object") return false;
  const status = (value as Record<string, unknown>).status;
  return status === "completed" || status === "blocked" || status === "failed";
}

function isHealthResponse(value: unknown): value is MarketWorkerHealthResponse {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return (
    (obj.status === "ok" || obj.status === "degraded") &&
    typeof obj.uptimeSeconds === "number" &&
    typeof obj.inFlight === "number" &&
    typeof obj.processed === "number" &&
    typeof obj.failed === "number"
  );
}
