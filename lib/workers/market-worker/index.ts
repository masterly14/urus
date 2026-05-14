/**
 * Punto de entrada de la lógica del Market Worker.
 *
 * Importable tanto desde la app principal (para tests) como desde el
 * server HTTP del Worker (workers/market-worker/src/server.ts).
 */

export {
  MarketWorkerRuntime,
  SUPPORTED_HOUSING_TYPES,
  type DetailCaptureCallback,
  type DetailCaptureResult,
  type MarketDetailFetcher,
  type MarketDetailFetcherResult,
  type MarketWorkerRuntimeMetrics,
  type MarketWorkerRuntimeOptions,
} from "./runtime";

export type {
  MarketExtractor,
  MarketExtractorInput,
  MarketExtractorItem,
  MarketExtractorResult,
} from "./extractor";
