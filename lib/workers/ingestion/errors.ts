/**
 * Clasificación de errores del Ingestion Worker.
 *
 * Permite tomar decisiones de retry diferenciadas por tipo de error
 * y exponerlos como métricas estructuradas.
 */

export type IngestionErrorCode =
  | "RATE_LIMIT"    // HTTP 408 / límite de peticiones Inmovilla
  | "NETWORK_ERROR" // ECONNREFUSED, ETIMEDOUT, ENOTFOUND, etc.
  | "TIMEOUT"       // Respuesta demasiado lenta
  | "AUTH_FAILED"   // 401/403, sesión expirada, token inválido
  | "DB_ERROR"      // Error de conexión Prisma / Neon
  | "PARSE_ERROR"   // Respuesta de la API con formato inesperado
  | "UNKNOWN";      // No clasificado

export class IngestionError extends Error {
  readonly code: IngestionErrorCode;
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor(
    code: IngestionErrorCode,
    message: string,
    retryable: boolean,
    cause?: unknown,
  ) {
    super(message);
    this.name = "IngestionError";
    this.code = code;
    this.retryable = retryable;
    this.cause = cause;
  }
}

/**
 * Clasifica cualquier error desconocido en un IngestionError tipado.
 * Si el error ya es un IngestionError lo devuelve sin modificar.
 */
export function classifyError(err: unknown): IngestionError {
  if (err instanceof IngestionError) return err;

  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (
    msg.includes("408") ||
    lower.includes("rate limit") ||
    lower.includes("límite de peticiones")
  ) {
    return new IngestionError("RATE_LIMIT", msg, true, err);
  }

  if (
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("enetunreach") ||
    lower.includes("econnreset") ||
    lower.includes("socket hang up") ||
    lower.includes("network error") ||
    lower.includes("fetch failed")
  ) {
    return new IngestionError("NETWORK_ERROR", msg, true, err);
  }

  if (
    lower.includes("etimedout") ||
    lower.includes("timeout") ||
    lower.includes("timed out")
  ) {
    return new IngestionError("TIMEOUT", msg, true, err);
  }

  if (
    msg.includes("401") ||
    msg.includes("403") ||
    lower.includes("unauthorized") ||
    lower.includes("forbidden") ||
    lower.includes("token inválido") ||
    lower.includes("sesión expirada") ||
    lower.includes("credenciales")
  ) {
    return new IngestionError("AUTH_FAILED", msg, false, err);
  }

  if (
    lower.includes("prisma") ||
    lower.includes("connection pool") ||
    lower.includes("prepared statement") ||
    lower.includes("p1001") ||  // Prisma: can't reach database server
    lower.includes("p1008") ||  // Prisma: operations timed out
    lower.includes("p1017") ||  // Prisma: server has closed the connection
    lower.includes("neon") ||
    lower.includes("database") ||
    lower.includes("sql")
  ) {
    return new IngestionError("DB_ERROR", msg, true, err);
  }

  if (
    lower.includes("json") ||
    lower.includes("parse") ||
    lower.includes("unexpected token") ||
    lower.includes("is not valid json")
  ) {
    return new IngestionError("PARSE_ERROR", msg, false, err);
  }

  return new IngestionError("UNKNOWN", msg, false, err);
}

/** Devuelve true si un error es de tipo rate limit */
export function isRateLimitError(err: unknown): boolean {
  return classifyError(err).code === "RATE_LIMIT";
}

/** Devuelve true si un error es transitorio y puede reintentarse */
export function isRetryableError(err: unknown): boolean {
  return classifyError(err).retryable;
}
