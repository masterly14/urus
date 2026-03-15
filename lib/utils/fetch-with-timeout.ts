/**
 * fetch con timeout configurable y soporte para undici dispatcher.
 */

export type FetchWithTimeoutOptions = {
  timeoutMs: number;
  dispatcher?: unknown;
};

/**
 * Intenta crear un undici Agent con los timeouts dados.
 * Devuelve undefined si undici no está disponible.
 */
export function tryCreateDispatcher(timeoutMs: number): unknown {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(/* webpackIgnore: true */ "undici");
    const AgentCtor = mod?.Agent ?? mod?.default?.Agent;
    if (typeof AgentCtor === "function") {
      return new AgentCtor({
        connect: { timeout: timeoutMs },
        bodyTimeout: timeoutMs,
        headersTimeout: timeoutMs,
      });
    }
  } catch {
    // undici no disponible
  }
  return undefined;
}

/**
 * Ejecuta fetch con AbortController para timeout.
 * @param url URL a la que hacer la petición.
 * @param init RequestInit estándar (method, headers, body, etc.).
 * @param options Timeout y dispatcher opcional (undici).
 * @returns Respuesta de fetch.
 * @throws Error si hay timeout o fallo de red.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  options: FetchWithTimeoutOptions,
): Promise<Response> {
  const { timeoutMs, dispatcher } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const fetchInit: Record<string, unknown> = {
    ...init,
    signal: controller.signal,
  };
  if (dispatcher) {
    fetchInit.dispatcher = dispatcher;
  }

  try {
    const response = await fetch(url, fetchInit as RequestInit);
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    const isAbort = err instanceof Error && err.name === "AbortError";
    const cause = isAbort
      ? `Request timeout after ${timeoutMs}ms`
      : (err instanceof Error ? err.cause ?? err.message : String(err));
    throw new Error(`Fetch failed: ${url} — ${cause}`, {
      cause: err instanceof Error ? err : undefined,
    });
  }
}
