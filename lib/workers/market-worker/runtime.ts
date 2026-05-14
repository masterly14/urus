/**
 * Lógica del Market Worker para Railway, separada del transporte HTTP para
 * que pueda testearse sin Fastify ni Playwright.
 *
 * Responsabilidades:
 *  - Validar y autenticar el request (`x-worker-secret`).
 *  - Limitar concurrencia (no abrir más navegadores Playwright que el pool).
 *  - Honrar `deadlineMs`: si la captura supera la ventana sincrónica, el
 *    Worker devuelve `accepted` y el extractor sigue corriendo en
 *    background. La app puede reconciliar consultando `MarketCrawlRun`
 *    por `runId`.
 *  - Persistir `MarketRawListing` (upsert idempotente por
 *    `(source, contentHash)`) y actualizar `MarketCrawlRun`.
 *  - Mantener métricas para `GET /internal/health`.
 *
 * No carga Playwright. No abre browsers. Solo orquesta extractors
 * inyectados por el caller (server del Worker) y persiste resultados.
 */

import type {
  MarketCrawlRun,
  PrismaClient,
  Prisma,
} from "@prisma/client";
import { z } from "zod";
import {
  MARKET_HOUSING_TYPES,
  MARKET_OPERATIONS,
  MARKET_SOURCES,
  type MarketHousingType,
  type MarketOperation,
  type MarketSource,
} from "@/lib/market";
import {
  MARKET_WORKER_AUTH_HEADER,
  MARKET_WORKER_FAILED_CODES,
  type MarketCrawlDetailResponse,
  type MarketCrawlSeedRequest,
  type MarketCrawlSeedResponse,
  type MarketWorkerHealthResponse,
} from "@/lib/workers/contracts/market-worker";
import type {
  MarketExtractor,
  MarketExtractorInput,
  MarketExtractorResult,
} from "./extractor";
import {
  parseDetailBySource,
  parsePhonesFromIdealistaPhonesPayload,
  type ParsedDetail,
} from "./detail";

const DEFAULT_CONCURRENCY = 2;
const DEFAULT_DEADLINE_MS = 8_000;

export interface DetailCaptureResult extends ParsedDetail {
  clickedRevealPhone: boolean;
}

export type DetailCaptureCallback = (ctx: {
  page: unknown;
  beforeHtml: string;
  httpStatus: number | null;
  traceId?: string;
}) => Promise<DetailCaptureResult>;

export interface MarketWorkerRuntimeOptions {
  secret: string;
  prisma: Pick<
    PrismaClient,
    | "marketCrawlRun"
    | "marketRawListing"
    | "marketCircuitBreaker"
    | "$transaction"
  >;
  /** Mapa source → extractor inyectado por el server. */
  extractors: Map<MarketSource, MarketExtractor>;
  /** Fetchers para captura puntual de detalle por portal (opcional). */
  detailFetchers?: Map<MarketSource, MarketDetailFetcher>;
  /**
   * Callbacks per-portal que ejecutan la interaccion con la Page Playwright
   * (click "Ver telefono" + extraccion). El runtime los inyecta cuando el
   * fetcher soporta `capture()`. Si falta callback para una source, se
   * usa el flujo legacy (fetchHtml + parseDetailBySource).
   */
  captureCallbacks?: Map<MarketSource, DetailCaptureCallback>;
  /** Máximo de capturas concurrentes en este proceso. */
  concurrency?: number;
  /** Tiempo máximo (ms) que el Worker espera al extractor antes de devolver accepted. */
  defaultDeadlineMs?: number;
  /** Inyectable para tests deterministas. */
  now?: () => Date;
  /** Versión del Worker para reportar en /health. */
  version?: string;
}

export interface MarketWorkerRuntimeMetrics {
  startedAt: number;
  inFlight: number;
  processed: number;
  failed: number;
  accepted: number;
  blocked: number;
}

// ---------------------------------------------------------------------------
// Validación con Zod
// ---------------------------------------------------------------------------

const crawlSeedSchema = z.object({
  runId: z.string().min(1),
  seedId: z.string().min(1),
  source: z.enum(MARKET_SOURCES as readonly [MarketSource, ...MarketSource[]]),
  operation: z.enum(MARKET_OPERATIONS as readonly [MarketOperation, ...MarketOperation[]]),
  url: z.string().url(),
  cursor: z.string().nullish(),
  budgetMs: z.number().int().positive().max(600_000),
  budgetRequests: z.number().int().positive().max(1_000),
  deadlineMs: z.number().int().positive().max(60_000).optional(),
  traceId: z.string().min(1),
});

type ValidatedPayload = z.infer<typeof crawlSeedSchema>;

const crawlDetailSchema = z.object({
  source: z.enum(MARKET_SOURCES as readonly [MarketSource, ...MarketSource[]]),
  canonicalUrl: z.string().url(),
  externalId: z.string().nullish(),
  timeoutMs: z.number().int().positive().max(120_000).optional(),
  traceId: z.string().min(1),
});

type ValidatedDetailPayload = z.infer<typeof crawlDetailSchema>;

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

export class MarketWorkerRuntime {
  private readonly secret: string;
  private readonly prisma: MarketWorkerRuntimeOptions["prisma"];
  private readonly extractors: Map<MarketSource, MarketExtractor>;
  private readonly detailFetchers: Map<MarketSource, MarketDetailFetcher>;
  private readonly captureCallbacks: Map<MarketSource, DetailCaptureCallback>;
  private readonly concurrency: number;
  private readonly defaultDeadlineMs: number;
  private readonly now: () => Date;
  private readonly version?: string;
  private readonly metrics: MarketWorkerRuntimeMetrics;
  private active = 0;
  /** Helper interno: hay callbacks de capture registrados? */
  private readonly captureFn: ((source: MarketSource) => DetailCaptureCallback | undefined) | null;

  constructor(options: MarketWorkerRuntimeOptions) {
    if (!options.secret) {
      throw new Error("MarketWorkerRuntime requiere un secret compartido");
    }
    if (!options.prisma) {
      throw new Error("MarketWorkerRuntime requiere un cliente Prisma");
    }
    if (!options.extractors || options.extractors.size === 0) {
      throw new Error("MarketWorkerRuntime requiere al menos un extractor registrado");
    }
    this.secret = options.secret;
    this.prisma = options.prisma;
    this.extractors = options.extractors;
    this.detailFetchers = options.detailFetchers ?? new Map();
    this.captureCallbacks = options.captureCallbacks ?? new Map();
    this.captureFn = this.captureCallbacks.size > 0
      ? (source) => this.captureCallbacks.get(source)
      : null;
    this.concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
    this.defaultDeadlineMs = Math.max(500, options.defaultDeadlineMs ?? DEFAULT_DEADLINE_MS);
    this.now = options.now ?? (() => new Date());
    this.version = options.version;
    this.metrics = {
      startedAt: Date.now(),
      inFlight: 0,
      processed: 0,
      failed: 0,
      accepted: 0,
      blocked: 0,
    };
  }

  isAuthorized(headerValue: string | undefined | null): boolean {
    return Boolean(headerValue) && headerValue === this.secret;
  }

  authHeaderName(): string {
    return MARKET_WORKER_AUTH_HEADER;
  }

  health(): MarketWorkerHealthResponse {
    const inFlight = this.metrics.inFlight;
    return {
      status: inFlight >= this.concurrency ? "degraded" : "ok",
      uptimeSeconds: Math.round((Date.now() - this.metrics.startedAt) / 1000),
      inFlight,
      processed: this.metrics.processed,
      failed: this.metrics.failed,
      version: this.version,
    };
  }

  metricsSnapshot(): MarketWorkerRuntimeMetrics {
    return { ...this.metrics };
  }

  /** Lista de fuentes con extractor registrado en este Worker. */
  registeredSources(): MarketSource[] {
    return [...this.extractors.keys()];
  }

  /**
   * Valida payload entrante. Devuelve el discriminado para que el server
   * Fastify pueda mapear a HTTP status apropiado sin lanzar excepciones.
   */
  validatePayload(payload: unknown):
    | { ok: true; data: ValidatedPayload }
    | { ok: false; status: number; error: string } {
    const parsed = crawlSeedSchema.safeParse(payload);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      return { ok: false, status: 400, error: `Payload inválido: ${detail}` };
    }
    if (!this.extractors.has(parsed.data.source)) {
      return {
        ok: false,
        status: 422,
        error: `Source ${parsed.data.source} no tiene extractor registrado en este Worker`,
      };
    }
    return { ok: true, data: parsed.data };
  }

  validateDetailPayload(payload: unknown):
    | { ok: true; data: ValidatedDetailPayload }
    | { ok: false; status: number; error: string } {
    const parsed = crawlDetailSchema.safeParse(payload);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      return { ok: false, status: 400, error: `Payload inválido: ${detail}` };
    }
    if (!this.detailFetchers.has(parsed.data.source)) {
      return {
        ok: false,
        status: 422,
        error: `Source ${parsed.data.source} no tiene fetcher de detalle registrado en este Worker`,
      };
    }
    return { ok: true, data: parsed.data };
  }

  /**
   * Procesa un seed delegado por la app.
   *
   * Contrato: el `MarketCrawlRun` referido por `runId` debe existir y
   * estar en estado RUNNING. Si no existe, devuelve `failed` con
   * `RUN_NOT_FOUND` (el caller no debería reintentar; es un bug).
   */
  async runCrawlSeed(payload: ValidatedPayload): Promise<MarketCrawlSeedResponse> {
    const { runId, traceId } = payload;

    const run = await this.prisma.marketCrawlRun.findUnique({
      where: { id: runId },
    });
    if (!run) {
      this.metrics.failed++;
      return {
        status: "failed",
        runId,
        errorCode: MARKET_WORKER_FAILED_CODES.RUN_NOT_FOUND,
        errorReason: `MarketCrawlRun ${runId} no existe`,
        traceId,
      };
    }

    if (this.active >= this.concurrency) {
      this.metrics.accepted++;
      return {
        status: "accepted",
        runId,
        reason: "CONCURRENCY_LIMIT",
        traceId,
      };
    }

    const extractor = this.extractors.get(payload.source);
    if (!extractor) {
      // Defensivo: validatePayload ya lo cubre, pero el Map podría mutar.
      this.metrics.failed++;
      return {
        status: "failed",
        runId,
        errorCode: MARKET_WORKER_FAILED_CODES.INTERNAL,
        errorReason: `Extractor para ${payload.source} no registrado`,
        traceId,
      };
    }

    const deadlineMs = Math.max(500, payload.deadlineMs ?? this.defaultDeadlineMs);

    this.active++;
    this.metrics.inFlight = this.active;

    const startedAt = Date.now();

    // Promesa de extracción que persiste y actualiza el run cuando termina.
    // Mantenemos referencia para que siga corriendo si gana el deadline.
    const extractionPromise = this.runExtractionAndPersist(
      run,
      extractor,
      payload,
    ).finally(() => {
      this.active = Math.max(0, this.active - 1);
      this.metrics.inFlight = this.active;
    });

    try {
      const raced = await Promise.race([
        extractionPromise.then((outcome) => ({ kind: "done" as const, outcome })),
        new Promise<{ kind: "deadline" }>((resolve) => {
          setTimeout(() => resolve({ kind: "deadline" }), deadlineMs);
        }),
      ]);

      if (raced.kind === "deadline") {
        this.metrics.accepted++;
        // Importante: NO esperamos extractionPromise aquí. El extractor
        // sigue corriendo en background y, cuando termine, persistirá y
        // actualizará el run. Adjuntamos un .catch para no dejar
        // unhandled rejections en logs.
        extractionPromise.catch((err) => {
          console.warn(
            `[market-worker] background extraction tras deadline falló runId=${runId}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        });
        return {
          status: "accepted",
          runId,
          reason: "DEADLINE_EXCEEDED",
          traceId,
        };
      }

      const { outcome } = raced;
      if (outcome.kind === "ok") {
        this.metrics.processed++;
        return {
          status: "completed",
          runId,
          itemsCaptured: outcome.itemsCaptured,
          itemsRejected: outcome.itemsRejected,
          pagesScanned: outcome.pagesScanned,
          cursorOut: outcome.cursorOut,
          elapsedMs: Date.now() - startedAt,
          traceId,
        };
      }
      if (outcome.kind === "blocked") {
        this.metrics.blocked++;
        return {
          status: "blocked",
          runId,
          reason: outcome.reason,
          traceId,
        };
      }
      this.metrics.failed++;
      return {
        status: "failed",
        runId,
        errorCode: outcome.errorCode,
        errorReason: outcome.errorReason,
        traceId,
      };
    } catch (err) {
      this.metrics.failed++;
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: "failed",
        runId,
        errorCode: MARKET_WORKER_FAILED_CODES.INTERNAL,
        errorReason: message,
        traceId,
      };
    }
  }

  /**
   * Captura una URL de detalle y extrae ficha completa: telefonos, descripcion,
   * fotos, referencia del anuncio y referencia catastral cuando exista.
   *
   * Si el fetcher soporta `capture()` (browser real), abre la pagina, hace click
   * en "Ver telefono" y extrae todo. Si no (ej. fetchers REST puros), cae al
   * flujo legacy de `fetchHtml + parseDetailBySource`.
   */
  async runCrawlDetail(payload: ValidatedDetailPayload): Promise<MarketCrawlDetailResponse> {
    if (this.active >= this.concurrency) {
      return {
        status: "failed",
        errorCode: "CONCURRENCY_LIMIT",
        errorReason: "worker saturated",
        traceId: payload.traceId,
      };
    }

    const fetcher = this.detailFetchers.get(payload.source);
    if (!fetcher) {
      return {
        status: "failed",
        errorCode: "FETCHER_NOT_FOUND",
        errorReason: `No detail fetcher for source ${payload.source}`,
        traceId: payload.traceId,
      };
    }

    const captureFn = (fetcher as { capture?: unknown }).capture;
    if (typeof captureFn === "function" && this.captureFn) {
      return await this.runCrawlDetailInteractive(fetcher, payload);
    }
    return await this.runCrawlDetailLegacy(fetcher, payload);
  }

  /**
   * Flujo interactivo: abre browser via fetcher.capture(), delega al portal
   * detail.ts (click + scrape), devuelve ficha completa.
   *
   * El callback per-portal vive en `workers/market-worker/src/portals/<portal>/detail.ts`
   * pero el runtime no lo importa directamente para no acoplar lib/ con
   * workers/. En su lugar, el server inyecta `captureCallbacks` en construccion.
   */
  private async runCrawlDetailInteractive(
    fetcher: MarketDetailFetcher,
    payload: ValidatedDetailPayload,
  ): Promise<MarketCrawlDetailResponse> {
    const callback = this.captureFn?.(payload.source);
    if (!callback || !fetcher.capture) {
      return await this.runCrawlDetailLegacy(fetcher, payload);
    }

    this.active++;
    this.metrics.inFlight = this.active;
    try {
      const captured = await fetcher.capture(
        payload.canonicalUrl,
        { timeoutMs: payload.timeoutMs, traceId: payload.traceId },
        async (ctx) => callback(ctx),
      );
      this.metrics.processed++;
      return {
        status: "completed",
        source: payload.source,
        canonicalUrl: payload.canonicalUrl,
        phones: captured.result.phones,
        advertiserName: captured.result.advertiserName,
        advertiserType: captured.result.advertiserType,
        description: captured.result.description,
        imageUrls: captured.result.imageUrls,
        listingReference: captured.result.listingReference,
        cadastralRef: captured.result.cadastralRef,
        clickedRevealPhone: captured.result.clickedRevealPhone,
        httpStatus: captured.httpStatus,
        strategy: captured.strategy ?? fetcher.name,
        traceId: payload.traceId,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/chain exhausted|captcha|datadome|blocked|forbidden|429/i.test(message)) {
        this.metrics.blocked++;
        return { status: "blocked", reason: message, traceId: payload.traceId };
      }
      this.metrics.failed++;
      return {
        status: "failed",
        errorCode: "CAPTURE_ERROR",
        errorReason: message,
        traceId: payload.traceId,
      };
    } finally {
      this.active = Math.max(0, this.active - 1);
      this.metrics.inFlight = this.active;
    }
  }

  /**
   * Flujo legacy: fetchHtml + parseDetailBySource. Mantenido para fetchers
   * que no implementen `capture()` (test doubles, eventuales fetchers REST
   * que solo dan teléfonos sin click).
   */
  private async runCrawlDetailLegacy(
    fetcher: MarketDetailFetcher,
    payload: ValidatedDetailPayload,
  ): Promise<MarketCrawlDetailResponse> {
    this.active++;
    this.metrics.inFlight = this.active;
    try {
      let fetched: MarketDetailFetcherResult;
      try {
        fetched = await fetcher.fetchHtml(payload.canonicalUrl, {
          timeoutMs: payload.timeoutMs,
          traceId: payload.traceId,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/chain exhausted|captcha|datadome|blocked|forbidden|429/i.test(message)) {
          this.metrics.blocked++;
          return {
            status: "blocked",
            reason: message,
            traceId: payload.traceId,
          };
        }
        this.metrics.failed++;
        return {
          status: "failed",
          errorCode: "FETCH_ERROR",
          errorReason: message,
          traceId: payload.traceId,
        };
      }

      const blockReason = detectBlockedDetailHtml(fetched.html, fetched.httpStatus);
      if (blockReason) {
        this.metrics.blocked++;
        return {
          status: "blocked",
          reason: blockReason,
          traceId: payload.traceId,
        };
      }

      const parsed = parseDetailBySource(payload.source, fetched.html);
      let phones = parsed.phones;

      if (
        payload.source === "source_d" &&
        phones.length === 0 &&
        parsed.idealistaAdId &&
        parsed.idealistaPhonesPath
      ) {
        const endpoint = buildIdealistaPhonesEndpoint(
          payload.canonicalUrl,
          parsed.idealistaPhonesPath,
          parsed.idealistaAdId,
        );
        if (endpoint) {
          try {
            const phonesPayload = await fetcher.fetchHtml(endpoint, {
              timeoutMs: payload.timeoutMs,
              traceId: payload.traceId,
            });
            phones = parsePhonesFromIdealistaPhonesPayload(phonesPayload.html);
          } catch {
            // Degradacion controlada.
          }
        }
      }

      this.metrics.processed++;
      return {
        status: "completed",
        source: payload.source,
        canonicalUrl: payload.canonicalUrl,
        phones,
        advertiserName: parsed.advertiserName,
        advertiserType: parsed.advertiserType,
        description: parsed.description,
        imageUrls: parsed.imageUrls,
        listingReference: parsed.listingReference,
        cadastralRef: parsed.cadastralRef,
        clickedRevealPhone: false,
        httpStatus: fetched.httpStatus,
        strategy: fetched.strategy ?? fetcher.name,
        traceId: payload.traceId,
      };
    } catch (err) {
      this.metrics.failed++;
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: "failed",
        errorCode: "INTERNAL",
        errorReason: message,
        traceId: payload.traceId,
      };
    } finally {
      this.active = Math.max(0, this.active - 1);
      this.metrics.inFlight = this.active;
    }
  }

  // -------------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------------

  /**
   * Ejecuta el extractor y persiste el resultado dentro del lifecycle del run.
   * Devuelve un outcome materializado (no la versión "ok" cruda del
   * extractor) para que `runCrawlSeed` decida la respuesta HTTP.
   */
  private async runExtractionAndPersist(
    run: MarketCrawlRun,
    extractor: MarketExtractor,
    payload: ValidatedPayload,
  ): Promise<RunOutcome> {
    const input: MarketExtractorInput = {
      source: payload.source,
      operation: payload.operation,
      url: payload.url,
      cursor: payload.cursor ?? null,
      budgetMs: payload.budgetMs,
      budgetRequests: payload.budgetRequests,
      traceId: payload.traceId,
    };

    let result: MarketExtractorResult;
    try {
      result = await extractor.extract(input);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.markRunFailed(run.id, "EXTRACTOR_THREW", message);
      return {
        kind: "error",
        errorCode: MARKET_WORKER_FAILED_CODES.EXTRACTOR_ERROR,
        errorReason: message,
      };
    }

    if (result.kind === "blocked") {
      await this.markRunBlocked(run.id, payload.source, result);
      return {
        kind: "blocked",
        reason: result.reason,
      };
    }

    if (result.kind === "error") {
      await this.markRunFailed(run.id, result.errorCode, result.errorReason);
      return {
        kind: "error",
        errorCode: result.errorCode,
        errorReason: result.errorReason,
      };
    }

    // result.kind === "ok"
    let captured = 0;
    let rejected = 0;
    try {
      const persisted = await this.persistRawItems(run.id, payload.source, result);
      captured = persisted.captured;
      rejected = persisted.rejected;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.markRunFailed(run.id, "PERSIST_ERROR", message);
      return {
        kind: "error",
        errorCode: MARKET_WORKER_FAILED_CODES.PERSIST_ERROR,
        errorReason: message,
      };
    }

    await this.completeRun(run.id, {
      pagesScanned: result.pagesScanned,
      itemsCaptured: captured,
      itemsRejected: rejected,
      cursorOut: result.cursorOut,
    });

    return {
      kind: "ok",
      itemsCaptured: captured,
      itemsRejected: rejected,
      pagesScanned: result.pagesScanned,
      cursorOut: result.cursorOut,
    };
  }

  private async persistRawItems(
    runId: string,
    source: MarketSource,
    result: Extract<MarketExtractorResult, { kind: "ok" }>,
  ): Promise<{ captured: number; rejected: number }> {
    if (result.items.length === 0) return { captured: 0, rejected: 0 };

    let captured = 0;
    let rejected = 0;
    const now = this.now();

    // Upsert por (source, contentHash). Si ya existe, no duplicamos pero
    // refrescamos `crawlRunId` y `capturedAt` para reflejar la última vez
    // que vimos el contenido.
    for (const item of result.items) {
      if (!item.canonicalUrl || !item.contentHash) {
        rejected++;
        continue;
      }
      try {
        await this.prisma.marketRawListing.upsert({
          where: {
            source_contentHash: {
              source,
              contentHash: item.contentHash,
            },
          },
          create: {
            source,
            externalId: item.externalId,
            canonicalUrl: item.canonicalUrl,
            crawlRunId: runId,
            httpStatus: item.httpStatus,
            contentHash: item.contentHash,
            payload: item.payload as unknown as Prisma.InputJsonValue,
            status: "CAPTURED",
            capturedAt: now,
          },
          update: {
            crawlRunId: runId,
            httpStatus: item.httpStatus,
            payload: item.payload as unknown as Prisma.InputJsonValue,
            capturedAt: now,
            status: "CAPTURED",
            rejectionReason: null,
          },
        });
        captured++;
      } catch (err) {
        rejected++;
        console.warn(
          `[market-worker] upsert raw listing falló source=${source} hash=${item.contentHash}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    return { captured, rejected };
  }

  private async completeRun(
    runId: string,
    args: {
      pagesScanned: number;
      itemsCaptured: number;
      itemsRejected: number;
      cursorOut: string | null;
    },
  ): Promise<void> {
    await this.prisma.marketCrawlRun.update({
      where: { id: runId },
      data: {
        status: "COMPLETED",
        pagesScanned: args.pagesScanned,
        itemsCaptured: args.itemsCaptured,
        itemsRejected: args.itemsRejected,
        cursorOut: args.cursorOut ?? null,
        finishedAt: this.now(),
      },
    });
  }

  private async markRunBlocked(
    runId: string,
    source: MarketSource,
    result: Extract<MarketExtractorResult, { kind: "blocked" }>,
  ): Promise<void> {
    await this.prisma.marketCrawlRun.update({
      where: { id: runId },
      data: {
        status: "PARTIAL",
        pagesScanned: result.pagesScanned,
        blockedCount: { increment: 1 },
        errorCode: "BLOCKED",
        errorMessage: result.reason,
        finishedAt: this.now(),
      },
    });
    // Abre el circuit breaker de la fuente. Diseño defensivo: increment
    // con upsert para que la primera vez no falle por filas inexistentes.
    await this.prisma.marketCircuitBreaker.upsert({
      where: { source },
      create: {
        source,
        status: "OPEN",
        failureCount: 1,
        openedAt: this.now(),
        updatedAt: this.now(),
      },
      update: {
        status: "OPEN",
        failureCount: { increment: 1 },
        openedAt: this.now(),
      },
    });
  }

  private async markRunFailed(
    runId: string,
    errorCode: string,
    errorMessage: string,
  ): Promise<void> {
    try {
      await this.prisma.marketCrawlRun.update({
        where: { id: runId },
        data: {
          status: "FAILED",
          errorCode,
          errorMessage: errorMessage.slice(0, 2000),
          finishedAt: this.now(),
        },
      });
    } catch (err) {
      // No re-lanzamos: ya estamos en path de error y queremos preservar
      // el motivo original.
      console.warn(
        `[market-worker] no se pudo marcar run ${runId} como FAILED: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Tipos auxiliares
// ---------------------------------------------------------------------------

type RunOutcome =
  | {
      kind: "ok";
      itemsCaptured: number;
      itemsRejected: number;
      pagesScanned: number;
      cursorOut: string | null;
    }
  | { kind: "blocked"; reason: string }
  | { kind: "error"; errorCode: string; errorReason: string };

export interface MarketDetailFetcherResult {
  html: string;
  httpStatus: number | null;
  strategy?: string;
}

export interface MarketDetailFetcher {
  readonly name: string;
  fetchHtml(
    pageUrl: string,
    opts?: { timeoutMs?: number; traceId?: string },
  ): Promise<MarketDetailFetcherResult>;
  /**
   * Opcional: abrir browser real, ejecutar `action(ctx)` con la `Page` y
   * devolver lo que el callback retorne. Solo fetchers con browser
   * (direct-browser, idealista-residential).
   */
  capture?<T>(
    pageUrl: string,
    opts: { timeoutMs?: number; traceId?: string },
    action: (ctx: {
      page: unknown;
      beforeHtml: string;
      httpStatus: number | null;
      traceId?: string;
    }) => Promise<T>,
  ): Promise<{
    result: T;
    httpStatus: number | null;
    strategy?: string;
    elapsedMs: number;
  }>;
}

const DETAIL_BLOCK_PATTERNS = [
  /captcha/i,
  /datadome/i,
  /access denied/i,
  /forbidden/i,
  /bot detection/i,
  /challenge/i,
];

function detectBlockedDetailHtml(html: string, status: number | null): string | null {
  if (status != null && [401, 403, 429, 503].includes(status)) {
    return `http_status_${status}`;
  }
  const snippet = html.slice(0, 20_000);
  for (const pattern of DETAIL_BLOCK_PATTERNS) {
    if (pattern.test(snippet)) return `blocked_pattern:${pattern.source}`;
  }
  return null;
}

function buildIdealistaPhonesEndpoint(
  canonicalUrl: string,
  phonesPathTemplate: string,
  adId: string,
): string | null {
  if (!phonesPathTemplate || !adId) return null;
  try {
    const base = new URL(canonicalUrl);
    const replaced = phonesPathTemplate.replaceAll("{adId}", adId);
    return new URL(replaced, `${base.protocol}//${base.host}`).toString();
  } catch {
    return null;
  }
}

// Re-export para que tests puedan tipear arrays de housing types sin
// importar Prisma.
export const SUPPORTED_HOUSING_TYPES: readonly MarketHousingType[] = MARKET_HOUSING_TYPES;
