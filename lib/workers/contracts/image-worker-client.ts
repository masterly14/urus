import {
  IMAGE_WORKER_AUTH_HEADER,
  IMAGE_WORKER_RUN_PATH,
  IMAGE_WORKER_TRACE_HEADER,
  ImageWorkerError,
  type ImageWorkerRunRequest,
  type ImageWorkerRunResponse,
} from "./image-worker";

export interface ImageWorkerClientOptions {
  baseUrl: string;
  secret: string;
  /** Timeout HTTP del request (ms). Independiente del `deadlineMs` lógico. */
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface CallImageWorkerOptions extends ImageWorkerRunRequest {
  /** Override puntual del timeout HTTP. */
  requestTimeoutMs?: number;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 8_000;

function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, "");
}

export class ImageWorkerClient {
  private readonly baseUrl: string;
  private readonly secret: string;
  private readonly requestTimeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ImageWorkerClientOptions) {
    if (!options.baseUrl) {
      throw new ImageWorkerError("MISCONFIGURED", "ImageWorkerClient requiere baseUrl");
    }
    if (!options.secret) {
      throw new ImageWorkerError("MISCONFIGURED", "ImageWorkerClient requiere secret compartido");
    }
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.secret = options.secret;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async runImageImport(input: CallImageWorkerOptions): Promise<ImageWorkerRunResponse> {
    const controller = new AbortController();
    const timeoutMs = Math.max(1_000, input.requestTimeoutMs ?? this.requestTimeoutMs);
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const body = JSON.stringify({
      statefoxId: input.statefoxId,
      portalUrl: input.portalUrl,
      source: input.source,
      maxImages: input.maxImages,
      deadlineMs: input.deadlineMs,
      traceId: input.traceId,
    } satisfies ImageWorkerRunRequest);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${IMAGE_WORKER_RUN_PATH}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          [IMAGE_WORKER_AUTH_HEADER]: this.secret,
          ...(input.traceId ? { [IMAGE_WORKER_TRACE_HEADER]: input.traceId } : {}),
        },
        body,
        signal: controller.signal,
      });

      if (response.status === 401 || response.status === 403) {
        throw new ImageWorkerError(
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
          throw new ImageWorkerError(
            "BAD_RESPONSE",
            `Respuesta del worker no es JSON válido (HTTP ${response.status})`,
            response.status,
          );
        }
      }

      if (!response.ok) {
        const message =
          (parsed && typeof parsed === "object" && "errorReason" in parsed
            ? String((parsed as Record<string, unknown>).errorReason)
            : `HTTP ${response.status}`);
        throw new ImageWorkerError("REJECTED", message, response.status);
      }

      if (!isImageWorkerRunResponse(parsed)) {
        throw new ImageWorkerError(
          "BAD_RESPONSE",
          "Respuesta del worker no cumple el contrato esperado",
          response.status,
        );
      }
      return parsed;
    } catch (err) {
      if (err instanceof ImageWorkerError) throw err;
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new ImageWorkerError(
          "TIMEOUT",
          `Worker no respondió en ${timeoutMs}ms`,
        );
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new ImageWorkerError("NETWORK", message);
    } finally {
      clearTimeout(timer);
    }
  }
}

function isImageWorkerRunResponse(value: unknown): value is ImageWorkerRunResponse {
  if (!value || typeof value !== "object") return false;
  const status = (value as Record<string, unknown>).status;
  return status === "completed" || status === "accepted" || status === "skipped" || status === "failed";
}
