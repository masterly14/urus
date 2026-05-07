/**
 * Fetcher compuesto: prueba varias estrategias en orden hasta obtener
 * un HTML que el extractor del portal **considera válido** (no bloqueado).
 *
 * Diseño:
 *  - El chain NO conoce las reglas de bloqueo de cada portal: recibe
 *    un callback `isBlocked(result)` que el extractor proporciona.
 *  - Si una estrategia lanza un error de transporte (`FetcherError`) o
 *    devuelve HTML que el caller marca como bloqueado, se prueba la
 *    siguiente. Solo se da por agotado cuando todas fallan.
 *  - Cada salto se reporta vía `onFallback` para observabilidad
 *    (logs estructurados, métricas, alertas de circuit breaker).
 */

import { FetcherError, type Fetcher, type FetcherFetchOptions, type FetcherResult } from "./types";

export interface ChainBlockDecision {
  blocked: boolean;
  reason?: string;
}

export interface ChainFetcherOptions {
  /** Estrategias a probar en orden. La primera es la preferida. */
  fetchers: Fetcher[];
  /**
   * Callback que el extractor implementa para detectar bloqueo en HTML.
   * Si devuelve `blocked: true`, el chain prueba la siguiente estrategia.
   */
  isBlocked: (result: FetcherResult) => ChainBlockDecision;
  /**
   * Reportes de fallback. Útil para logs estructurados ("strategy X
   * bloqueada → cae a Y") y para abrir circuit breaker por estrategia.
   */
  onFallback?: (info: ChainFallbackEvent) => void;
  /** Nombre opcional del chain (default: "chain"). */
  name?: string;
}

export interface ChainFallbackEvent {
  pageUrl: string;
  fromStrategy: string;
  toStrategy: string;
  reason: string;
  traceId?: string;
}

export interface ChainExhaustedError {
  attempts: Array<{
    strategy: string;
    blocked: boolean;
    reason?: string;
    error?: string;
  }>;
}

export class ChainExhausted extends FetcherError {
  public readonly chainAttempts: ChainExhaustedError["attempts"];
  constructor(attempts: ChainExhaustedError["attempts"]) {
    super(
      "INTERNAL",
      `Todas las estrategias del chain fallaron (${attempts.length} intentos)`,
      "chain",
    );
    this.name = "ChainExhausted";
    this.chainAttempts = attempts;
  }
}

export function createChainedFetcher(opts: ChainFetcherOptions): Fetcher {
  if (!opts.fetchers || opts.fetchers.length === 0) {
    throw new FetcherError("MISCONFIGURED", "createChainedFetcher requiere al menos un fetcher", "chain");
  }

  const fetchers = opts.fetchers.slice();
  const name = opts.name ?? "chain";

  return {
    name,
    fetchHtml: async (pageUrl: string, fetchOpts?: FetcherFetchOptions): Promise<FetcherResult> => {
      const attempts: ChainExhaustedError["attempts"] = [];
      for (let i = 0; i < fetchers.length; i++) {
        const current = fetchers[i]!;
        let result: FetcherResult | null = null;
        let errorMessage: string | undefined;
        try {
          result = await current.fetchHtml(pageUrl, fetchOpts);
        } catch (err) {
          errorMessage = err instanceof Error ? err.message : String(err);
        }

        if (result) {
          const block = opts.isBlocked(result);
          if (!block.blocked) return result;
          attempts.push({
            strategy: current.name,
            blocked: true,
            reason: block.reason,
          });
          if (i < fetchers.length - 1) {
            const next = fetchers[i + 1]!;
            opts.onFallback?.({
              pageUrl,
              fromStrategy: current.name,
              toStrategy: next.name,
              reason: block.reason ?? "blocked",
              traceId: fetchOpts?.traceId,
            });
          }
          continue;
        }

        // Excepción de transporte → reintentar siguiente.
        attempts.push({
          strategy: current.name,
          blocked: false,
          error: errorMessage,
        });
        if (i < fetchers.length - 1) {
          const next = fetchers[i + 1]!;
          opts.onFallback?.({
            pageUrl,
            fromStrategy: current.name,
            toStrategy: next.name,
            reason: errorMessage ?? "fetcher error",
            traceId: fetchOpts?.traceId,
          });
        }
      }
      throw new ChainExhausted(attempts);
    },
  };
}
