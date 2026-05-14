/**
 * Abstracción de "fetcher" de páginas HTML.
 *
 * Un fetcher solo se encarga de **traer el HTML** de una URL. NO sabe
 * parsear ni detectar bloqueos por contenido (eso es responsabilidad
 * del extractor de cada portal). Esto permite componer estrategias
 * anti-bot en cadena (`chain.ts`) sin acoplar la lógica de cada portal.
 *
 * Estrategias previstas en V1:
 *  - `direct-browser`     : Playwright Chromium directo (sin proxy).
 *  - `residential-proxy`  : Playwright + Bright Data Residential Proxy.
 *  - `web-unlocker`       : Bright Data Web Unlocker API (sin browser).
 *
 * El extractor decide qué cadena usar para su portal en función de
 * variables de entorno (ver `portals/registry.ts`).
 */

export interface FetcherFetchOptions {
  /** Timeout total para esta petición (ms). */
  timeoutMs?: number;
  /** Pista para tracing/logs. */
  traceId?: string;
}

export interface FetcherResult {
  /** HTML completo de la respuesta (puede estar vacío si el portal devolvió 4xx/5xx). */
  html: string;
  /** Status HTTP. `null` cuando el fetcher no expone status (p. ej. WebSocket). */
  httpStatus: number | null;
  /** Nombre de la estrategia que generó este resultado. */
  strategy: string;
  /** Latencia observada por el fetcher (ms). */
  elapsedMs: number;
}

/**
 * Contexto que se pasa al callback `capture()`. Da acceso a la `Page`
 * Playwright real para que el portal pueda hacer click, esperar
 * mutaciones DOM y extraer datos. El HTML inicial (pre-click) ya esta
 * resuelto para acelerar parsers que no necesitan interactuar.
 */
export interface DetailCaptureContext {
  // Tipo any para no obligar a importar playwright en consumidores que solo
  // usan fetchHtml. Los consumidores que llaman capture() casteain a Page.
  page: unknown;
  beforeHtml: string;
  httpStatus: number | null;
  traceId?: string;
}

export interface DetailCaptureFetcherResult<T> {
  result: T;
  httpStatus: number | null;
  strategy: string;
  elapsedMs: number;
}

export type DetailCaptureAction<T> = (ctx: DetailCaptureContext) => Promise<T>;

export interface Fetcher {
  /** Identificador estable, usado en logs y métricas. */
  readonly name: string;
  /** Trae el HTML de `pageUrl`. */
  fetchHtml(pageUrl: string, opts?: FetcherFetchOptions): Promise<FetcherResult>;
  /**
   * Opcional: abre la pagina en un browser real, ejecuta `action(ctx)` con
   * acceso a `Page` Playwright, y devuelve el valor que el callback retorne.
   *
   * Solo los fetchers con browser (direct-browser, idealista-residential)
   * pueden implementarlo. El web-unlocker REST no puede.
   */
  capture?<T>(
    pageUrl: string,
    opts: FetcherFetchOptions,
    action: DetailCaptureAction<T>,
  ): Promise<DetailCaptureFetcherResult<T>>;
}

/**
 * Error tipado emitido por un fetcher cuando algo falla a nivel de
 * transporte (no a nivel de contenido).
 */
export class FetcherError extends Error {
  public readonly code:
    | "TIMEOUT"
    | "NETWORK"
    | "HTTP_ERROR"
    | "MISCONFIGURED"
    | "UNAUTHORIZED"
    | "INTERNAL";
  public readonly httpStatus?: number;
  public readonly strategy: string;

  constructor(
    code: FetcherError["code"],
    message: string,
    strategy: string,
    httpStatus?: number,
  ) {
    super(message);
    this.name = "FetcherError";
    this.code = code;
    this.strategy = strategy;
    this.httpStatus = httpStatus;
  }
}
