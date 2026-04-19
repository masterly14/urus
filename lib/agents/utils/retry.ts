/**
 * Retry wrapper con backoff exponencial para llamadas LLM.
 *
 * Delays por defecto: 1s → 2s → 4s (3 intentos).
 * Solo reintenta errores transitorios (rate limit, timeout, network).
 */

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 1_000;

function isTransientError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("rate limit") ||
    msg.includes("429") ||
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("socket hang up") ||
    msg.includes("fetch failed") ||
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("overloaded")
  );
}

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: RetryOptions,
): Promise<T> {
  const maxAttempts = opts?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelay = opts?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts || !isTransientError(err)) {
        throw err;
      }
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}
