/**
 * Contrato del extractor por portal.
 *
 * Cada portal del Core (Fotocasa, Pisos.com, Milanuncios, …) implementa
 * este interface. El runtime del Market Worker selecciona el extractor por
 * `MarketSource` y le delega la captura de un seed concreto.
 *
 * El extractor es **agnóstico de DB y de transport**: solo recibe inputs
 * planos y devuelve un resultado discriminado. La persistencia (upsert de
 * `MarketRawListing`, update de `MarketCrawlRun`) es responsabilidad del
 * runtime, no del extractor. Esto facilita tests con HTML fixtures y
 * permite migrar de Playwright a otra herramienta sin tocar el runtime.
 */

import type {
  MarketOperation,
  MarketSource,
  RawListingPayload,
} from "@/lib/market";

export interface MarketExtractorInput {
  source: MarketSource;
  operation: MarketOperation;
  /** URL del listado paginable (de MarketSeed.url). */
  url: string;
  /** Cursor opcional de continuación (página, scroll-token, etc.). */
  cursor?: string | null;
  /** Tope global de tiempo (ms) que el extractor puede consumir. */
  budgetMs: number;
  /** Tope global de requests HTTP que el extractor puede hacer. */
  budgetRequests: number;
  /** Pista de logging para correlacionar con el run. */
  traceId?: string;
}

/**
 * Item bruto extraído por el portal. El runtime lo materializa como
 * `MarketRawListing`. La identidad técnica para dedupe es
 * `(source, contentHash)` — definida en el schema Prisma.
 */
export interface MarketExtractorItem {
  /** ID del anuncio en el portal cuando se puede extraer. */
  externalId: string | null;
  /** URL canonicalizada del anuncio (sin tracking). */
  canonicalUrl: string;
  /**
   * Hash determinístico de los campos principales, calculado por el
   * extractor. El runtime lo confía para deduplicar dentro y entre runs.
   */
  contentHash: string;
  /** HTTP status de la última captura (cuando aplica). */
  httpStatus: number | null;
  /** Payload bruto compatible con `RawListingPayload`. */
  payload: RawListingPayload;
}

/**
 * Resultado discriminado de una extracción.
 *
 *  - `ok`: extracción exitosa, posibles items y cursor de continuación.
 *  - `blocked`: el portal devolvió señal de bloqueo (captcha, 403…).
 *    Activa el circuit breaker en el runtime.
 *  - `error`: fallo técnico no recuperable en este intento (parser roto,
 *    error de red sostenido…). El runtime marca el run como FAILED.
 */
export type MarketExtractorResult =
  | {
      kind: "ok";
      items: MarketExtractorItem[];
      pagesScanned: number;
      cursorOut: string | null;
    }
  | {
      kind: "blocked";
      reason: string;
      pagesScanned: number;
    }
  | {
      kind: "error";
      errorCode: string;
      errorReason: string;
      pagesScanned: number;
    };

export interface MarketExtractor {
  /** Identifica al portal que cubre este extractor. */
  readonly source: MarketSource;
  /** Ejecuta la captura. Debe respetar `budgetMs` y `budgetRequests`. */
  extract(input: MarketExtractorInput): Promise<MarketExtractorResult>;
}
