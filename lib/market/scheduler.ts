/**
 * Scheduler del Core de Mercado.
 *
 * Orquesta el ciclo de vida de captura para los seeds de portales activos:
 *
 *   1. `discoverDueSeeds`: selecciona seeds vencidos (`active = true AND
 *      lastRunAt + cadenceMinutes <= now`), crea `MarketCrawlRun` en
 *      estado RUNNING y encola `MARKET_CRAWL_SEED` con `idempotencyKey`
 *      por window-bucket (evita duplicados si el cron se ejecuta dos veces
 *      en la misma ventana de cadencia).
 *
 *   2. `runCrawlTick`: drena un batch de jobs `MARKET_CRAWL_SEED` y los
 *      delega al Market Worker via `MarketWorkerClient.runCrawlSeed`.
 *      Persiste el resultado (COMPLETED / FAILED / PARTIAL) y actualiza
 *      `MarketCircuitBreaker` cuando hay bloqueo o error.
 *
 *   3. `enqueueRefreshSnapshot`: por cada ciudad activa, encola un job
 *      `MARKET_REFRESH_SNAPSHOT` con bucket de 30 min para idempotencia.
 *
 * Solo procesa sources en `ACTIVE_SOURCES_V1` (Fotocasa + Pisos.com en MVP).
 * Idealista (`source_d`) y Milanuncios (`source_c`) quedan filtrados aunque
 * existan seeds en DB (defensa en profundidad).
 *
 * Ver:
 *   - docs/core-mvp-status.md §3.3 (orquestacion)
 *   - lib/market/source-mapping.ts (ACTIVE_SOURCES_V1)
 *   - lib/workers/contracts/market-worker-client.ts (cliente HTTP)
 */

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  enqueueJob,
  dequeueJob,
  markCompleted,
  markFailed,
  requeueJob,
} from "@/lib/job-queue";
import {
  getActiveSourcesV1,
  MARKET_PRIORITY_BACKGROUND,
  MARKET_PRIORITY_NORMALIZE_ON_DEMAND,
  type MarketSource,
} from "@/lib/market";
import {
  MarketWorkerClient,
  MarketWorkerError,
  type MarketCrawlSeedRequest,
} from "@/lib/workers/contracts";

const DEFAULT_BUDGET_MS = 60_000;
const DEFAULT_BUDGET_REQUESTS = 50;
const DEFAULT_DEADLINE_MS = 8_000;

// ---------------------------------------------------------------------------
// Tipos publicos
// ---------------------------------------------------------------------------

export interface DiscoverDueSeedsResult {
  scanned: number;
  enqueued: number;
  skippedBlocked: number;
  skippedAlreadyEnqueued: number;
  details: Array<{ seedId: string; status: "enqueued" | "blocked" | "duplicate" }>;
}

export interface CrawlTickResult {
  processed: number;
  failed: number;
  blocked: number;
  accepted: number;
  noWork: boolean;
  normalizeJobsEnqueued: number;
  queueWaitMsAvg: number;
  queueWaitMsP95: number;
  queueWaitMsMax: number;
}

export interface RefreshSnapshotResult {
  enqueued: number;
  cities: string[];
}

function computePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1),
  );
  return Math.round(sorted[index]);
}

// ---------------------------------------------------------------------------
// 1) Discover-seeds
// ---------------------------------------------------------------------------

/**
 * Devuelve `floor(timestamp / cadenceMinutes)` para crear un identificador
 * estable por ventana de cadencia. Asi dos crons consecutivos dentro de la
 * misma ventana producen el mismo `idempotencyKey` y el segundo no encola.
 */
function windowBucket(now: Date, cadenceMinutes: number): number {
  const windowMs = Math.max(60, cadenceMinutes) * 60_000;
  return Math.floor(now.getTime() / windowMs);
}

/**
 * Selecciona seeds vencidos por cadencia, los marca como en proceso (creando
 * `MarketCrawlRun` en RUNNING) y encola `MARKET_CRAWL_SEED` por cada uno.
 * Saltea seeds cuyo source este en `MarketCircuitBreaker.status = OPEN`.
 */
export async function discoverDueSeeds(options: {
  now?: Date;
  /** Limite de seeds a procesar por tick (default 25). */
  limit?: number;
} = {}): Promise<DiscoverDueSeedsResult> {
  const now = options.now ?? new Date();
  const limit = Math.min(Math.max(1, options.limit ?? 25), 100);

  // Sources activos en este tick: Fotocasa + Pisos.com (MVP) y, si
  // MARKET_IDEALISTA_ENABLED=true, tambien Idealista (Fase 2.c).
  const sources = getActiveSourcesV1().filter(
    (s): s is Exclude<MarketSource, "unknown"> => s !== "unknown",
  );

  // Cargamos breakers en una sola consulta. Un breaker OPEN bloquea sus seeds.
  const breakers = await prisma.marketCircuitBreaker.findMany({
    where: { source: { in: sources } },
  });
  const blockedSources = new Set(
    breakers.filter((b) => b.status === "OPEN").map((b) => b.source),
  );

  const dueSeeds = await prisma.marketSeed.findMany({
    where: {
      active: true,
      source: { in: sources },
      OR: [
        { lastRunAt: null },
        // PostgreSQL: lastRunAt + (cadenceMinutes minutes) <= now
        // Prisma no soporta interval aritmetico directo; usamos $queryRaw fallback
        // si esto se vuelve insuficiente. Para MVP usamos heuristica simple:
        // si lastRunAt < now - max(cadence) lo consideramos due. La verificacion
        // fina la hacemos en JS abajo.
        { lastRunAt: { lt: new Date(now.getTime() - 60_000) } },
      ],
    },
    orderBy: [{ priority: "desc" }, { lastRunAt: "asc" }],
    take: limit * 3,
  });

  const result: DiscoverDueSeedsResult = {
    scanned: 0,
    enqueued: 0,
    skippedBlocked: 0,
    skippedAlreadyEnqueued: 0,
    details: [],
  };

  for (const seed of dueSeeds) {
    if (result.enqueued >= limit) break;
    result.scanned++;

    // Validacion fina: respetamos cadencia con precision al minuto.
    if (seed.lastRunAt) {
      const dueAt = new Date(
        seed.lastRunAt.getTime() + seed.cadenceMinutes * 60_000,
      );
      if (dueAt > now) continue;
    }

    if (blockedSources.has(seed.source)) {
      result.skippedBlocked++;
      result.details.push({ seedId: seed.id, status: "blocked" });
      continue;
    }

    const bucket = windowBucket(now, seed.cadenceMinutes);
    const idempotencyKey = `market:crawl:${seed.id}:${bucket}`;

    // Creamos el run primero. Si despues el enqueue falla por idempotencia
    // (otro cron ya creo el job), borramos el run para no acumular orfanos.
    const correlationId = randomUUID();
    const run = await prisma.marketCrawlRun.create({
      data: {
        seedId: seed.id,
        source: seed.source,
        status: "RUNNING",
        budgetMs: DEFAULT_BUDGET_MS,
        budgetRequests: DEFAULT_BUDGET_REQUESTS,
        cursorIn: seed.lastCursor,
        correlationId,
      },
    });

    try {
      await enqueueJob({
        type: "MARKET_CRAWL_SEED",
        payload: {
          runId: run.id,
          seedId: seed.id,
          source: seed.source,
          operation: seed.operation,
          url: seed.url,
          cursor: seed.lastCursor,
          budgetMs: DEFAULT_BUDGET_MS,
          budgetRequests: DEFAULT_BUDGET_REQUESTS,
          traceId: correlationId,
        },
        idempotencyKey,
        priority: seed.priority,
      });
      result.enqueued++;
      result.details.push({ seedId: seed.id, status: "enqueued" });

      await prisma.marketSeed.update({
        where: { id: seed.id },
        data: { lastRunAt: now },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Idempotencia: enqueueJob lanza P2002 si la key ya existe. Eliminamos
      // el run que acabamos de crear para no dejarlo abierto.
      const isUnique = /Unique constraint|P2002/i.test(message);
      if (isUnique) {
        await prisma.marketCrawlRun.delete({ where: { id: run.id } }).catch(() => undefined);
        result.skippedAlreadyEnqueued++;
        result.details.push({ seedId: seed.id, status: "duplicate" });
      } else {
        // Otro error: marcamos el run como FAILED para no quedarnos con
        // RUNNING colgado.
        await prisma.marketCrawlRun
          .update({
            where: { id: run.id },
            data: {
              status: "FAILED",
              errorCode: "ENQUEUE_ERROR",
              errorMessage: message.slice(0, 2000),
              finishedAt: now,
            },
          })
          .catch(() => undefined);
        throw err;
      }
    }
  }

  console.log(
    `[market:scheduler] discover-seeds scanned=${result.scanned} enqueued=${result.enqueued} blocked=${result.skippedBlocked} duplicates=${result.skippedAlreadyEnqueued}`,
  );
  return result;
}

// ---------------------------------------------------------------------------
// 2) Crawl-tick
// ---------------------------------------------------------------------------

interface CrawlSeedJobPayload {
  runId: string;
  seedId: string;
  source: MarketSource;
  operation: "sale" | "rent";
  url: string;
  cursor?: string | null;
  budgetMs?: number;
  budgetRequests?: number;
  traceId: string;
}

function readWorkerClient(): MarketWorkerClient | null {
  const baseUrl = process.env.MARKET_WORKER_BASE_URL?.trim();
  const secret = process.env.MARKET_WORKER_SHARED_SECRET?.trim();
  const requestTimeoutMs = Number(
    process.env.MARKET_WORKER_REQUEST_TIMEOUT_MS ?? 60_000,
  );
  if (!baseUrl || !secret) return null;
  return new MarketWorkerClient({
    baseUrl,
    secret,
    requestTimeoutMs: Math.max(1_000, requestTimeoutMs),
  });
}

/**
 * Procesa un batch de `MARKET_CRAWL_SEED`. Por cada job:
 *   - Llama al Market Worker con el contrato de runCrawlSeed.
 *   - Persiste resultado en `MarketCrawlRun` (el Worker tambien lo hace; aqui
 *     consolidamos transiciones que el Worker no maneja, como `accepted`).
 *   - Maneja circuit breaker en `blocked` y `failed`.
 */
export async function runCrawlTick(options: {
  workerId?: string;
  batchSize?: number;
} = {}): Promise<CrawlTickResult> {
  const workerId = options.workerId ?? `cron-market-crawl-${randomUUID().slice(0, 8)}`;
  const batchSize = Math.min(Math.max(1, options.batchSize ?? 5), 25);

  const client = readWorkerClient();
  if (!client) {
    console.warn(
      "[market:scheduler] crawl-tick: MARKET_WORKER_BASE_URL/SHARED_SECRET no configurados — skip",
    );
    return {
      processed: 0,
      failed: 0,
      blocked: 0,
      accepted: 0,
      noWork: true,
      normalizeJobsEnqueued: 0,
      queueWaitMsAvg: 0,
      queueWaitMsP95: 0,
      queueWaitMsMax: 0,
    };
  }

  const result: CrawlTickResult = {
    processed: 0,
    failed: 0,
    blocked: 0,
    accepted: 0,
    noWork: true,
    normalizeJobsEnqueued: 0,
    queueWaitMsAvg: 0,
    queueWaitMsP95: 0,
    queueWaitMsMax: 0,
  };
  const queueWaitSamplesMs: number[] = [];

  for (let i = 0; i < batchSize; i++) {
    const { job } = await dequeueJob({
      workerId,
      types: ["MARKET_CRAWL_SEED"],
    });
    if (!job) break;
    result.noWork = false;
    queueWaitSamplesMs.push(
      Math.max(0, Date.now() - Math.max(job.createdAt.getTime(), job.availableAt.getTime())),
    );

    const payload = (job.payload ?? {}) as unknown as CrawlSeedJobPayload;
    if (!payload.runId || !payload.seedId || !payload.url || !payload.source) {
      await markFailed({
        jobId: job.id,
        error: "MARKET_CRAWL_SEED payload invalido",
        workerId,
        permanent: true,
      });
      result.failed++;
      continue;
    }

    const request: MarketCrawlSeedRequest = {
      runId: payload.runId,
      seedId: payload.seedId,
      source: payload.source,
      operation: payload.operation,
      url: payload.url,
      cursor: payload.cursor ?? null,
      budgetMs: payload.budgetMs ?? DEFAULT_BUDGET_MS,
      budgetRequests: payload.budgetRequests ?? DEFAULT_BUDGET_REQUESTS,
      deadlineMs: DEFAULT_DEADLINE_MS,
      traceId: payload.traceId,
    };

    try {
      const response = await client.runCrawlSeed(request);

      if (response.status === "completed") {
        result.processed++;
        await markCompleted({ jobId: job.id, workerId });

        // Encolamos un MARKET_NORMALIZE_BATCH leve (idempotency-key por minuto)
        // para que la pipeline siguiente arranque pronto sin esperar al cron
        // generico de consumer. La idempotencia evita acumular jobs duplicados.
        const minuteBucket = Math.floor(Date.now() / 60_000);
        await enqueueJob({
          type: "MARKET_NORMALIZE_BATCH",
          payload: { batchSize: 50, source: payload.source },
          idempotencyKey: `market:normalize-batch:${payload.source}:${minuteBucket}`,
          priority: MARKET_PRIORITY_NORMALIZE_ON_DEMAND,
        }).catch((err) => {
          if (!/Unique constraint|P2002/i.test(String(err))) {
            throw err;
          }
        });
        result.normalizeJobsEnqueued++;
      } else if (response.status === "accepted") {
        result.accepted++;
        if (response.reason === "CONCURRENCY_LIMIT") {
          // El Worker estaba saturado y NO arrancó el extractor. Si lo
          // marcamos completado, el `MarketCrawlRun` queda huérfano en
          // RUNNING y los items nunca se capturan. Reencolamos sin
          // penalizar `attempts` (el job es legítimo, solo necesita un
          // slot libre) y aplicamos un jitter de 1-6s para evitar que
          // todos los rebotes vuelvan al mismo tick.
          const jitterMs = 1_000 + Math.floor(Math.random() * 5_000);
          await requeueJob({
            jobId: job.id,
            reason: `worker concurrency limit (run=${response.runId})`,
            workerId,
            retryDelayMs: jitterMs,
          });
        } else {
          // DEADLINE_EXCEEDED: el extractor arrancó y sigue corriendo en
          // background. Marcamos completado (responsabilidad delegada al
          // worker, que actualizará `MarketCrawlRun` cuando termine).
          await markCompleted({ jobId: job.id, workerId });
        }
      } else if (response.status === "blocked") {
        result.blocked++;
        await markFailed({
          jobId: job.id,
          error: `Worker blocked: ${response.reason}`,
          workerId,
        });
        await openCircuitBreaker(payload.source, response.reason);
      } else {
        result.failed++;
        const isPermanent = response.errorCode === "RUN_NOT_FOUND";
        await markFailed({
          jobId: job.id,
          error: `Worker failed [${response.errorCode}]: ${response.errorReason}`,
          workerId,
          permanent: isPermanent,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isAuth =
        err instanceof MarketWorkerError && err.code === "UNAUTHORIZED";
      result.failed++;
      await markFailed({
        jobId: job.id,
        error: `Cliente Worker error: ${message}`,
        workerId,
        permanent: isAuth,
      });
    }
  }

  if (queueWaitSamplesMs.length > 0) {
    const total = queueWaitSamplesMs.reduce((acc, ms) => acc + ms, 0);
    result.queueWaitMsAvg = Math.round(total / queueWaitSamplesMs.length);
    result.queueWaitMsP95 = computePercentile(queueWaitSamplesMs, 95);
    result.queueWaitMsMax = Math.max(...queueWaitSamplesMs);
  }

  console.log(
    `[market:scheduler] crawl-tick processed=${result.processed} accepted=${result.accepted} blocked=${result.blocked} failed=${result.failed} normalizeEnqueued=${result.normalizeJobsEnqueued} queueWaitAvgMs=${result.queueWaitMsAvg} queueWaitP95Ms=${result.queueWaitMsP95} queueWaitMaxMs=${result.queueWaitMsMax}`,
  );
  return result;
}

async function openCircuitBreaker(
  source: MarketSource,
  reason: string,
): Promise<void> {
  await prisma.marketCircuitBreaker
    .upsert({
      where: { source },
      create: {
        source,
        status: "OPEN",
        failureCount: 1,
        openedAt: new Date(),
        updatedAt: new Date(),
      },
      update: {
        status: "OPEN",
        failureCount: { increment: 1 },
        openedAt: new Date(),
      },
    })
    .catch((err) => {
      console.warn(
        `[market:scheduler] no se pudo abrir circuit breaker source=${source}: ${
          err instanceof Error ? err.message : err
        } reason=${reason}`,
      );
    });
}

// ---------------------------------------------------------------------------
// 3) Refresh-snapshot dispatcher
// ---------------------------------------------------------------------------

/**
 * Por cada ciudad con seeds activos, encola un job `MARKET_REFRESH_SNAPSHOT`
 * con bucket de 30 minutos como idempotencyKey.
 */
export async function enqueueRefreshSnapshot(options: {
  now?: Date;
} = {}): Promise<RefreshSnapshotResult> {
  const now = options.now ?? new Date();
  const bucket = Math.floor(now.getTime() / (30 * 60_000));

  const cities = await prisma.marketSeed.findMany({
    where: { active: true, source: { in: [...getActiveSourcesV1()] } },
    select: { city: true },
    distinct: ["city"],
  });

  const result: RefreshSnapshotResult = { enqueued: 0, cities: [] };
  for (const { city } of cities) {
    try {
      await enqueueJob({
        type: "MARKET_REFRESH_SNAPSHOT",
        payload: { city },
        idempotencyKey: `market:snapshot:${city}:${bucket}`,
        priority: MARKET_PRIORITY_BACKGROUND,
      });
      result.enqueued++;
      result.cities.push(city);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!/Unique constraint|P2002/i.test(message)) throw err;
      // Ya estaba encolado en esta ventana — OK.
    }
  }

  console.log(
    `[market:scheduler] refresh-snapshot enqueued=${result.enqueued} cities=${result.cities.join(",") || "-"}`,
  );
  return result;
}

// ---------------------------------------------------------------------------
// 4) Health-check
// ---------------------------------------------------------------------------

export interface HealthCheckSnapshot {
  workerStatus: "ok" | "degraded" | "unreachable" | "unconfigured";
  perPortal: Array<{
    source: MarketSource;
    breakerStatus: string;
    failureCount: number;
    lastCrawlAt: string | null;
    lastCrawlStatus: string | null;
    activeListings: number;
    snapshotFreshAt: string | null;
    freshnessSeconds: number | null;
  }>;
  /**
   * Metricas adicionales de Idealista (Fase 2.c). Solo presente si el
   * feature flag esta activo. Ver `collectIdealistaMetrics`.
   */
  idealista?: IdealistaMetrics;
  generatedAt: string;
}

export interface IdealistaMetrics {
  /** Si el flag MARKET_IDEALISTA_ENABLED esta activo. */
  enabled: boolean;
  /** Numero de paginas escaneadas via Web Unlocker en el mes corriente. */
  monthRequests: number;
  /** Coste estimado del mes corriente (USD). Premium domain ~$0.005/req. */
  monthCostUsd: number;
  /** Umbral de alerta de coste (USD). Default 40 (80% de 50). */
  costAlertThreshold: number;
  /** Si monthCostUsd >= costAlertThreshold. */
  costAlert: boolean;
  /**
   * Aproximacion del fallback rate al residencial en las ultimas 24h.
   * Calculado como `blockedRuns / totalRuns` donde un "blockedRun" es un
   * `MarketCrawlRun` con `blockedCount > 0` (el extractor recibio al menos
   * un fallback por blocked durante el run). Es un proxy: no distingue
   * fallback exitoso (resuelto por residencial) vs fallback agotado.
   */
  fallbackRate24h: number;
  /** Numero de runs de las ultimas 24h. */
  totalRuns24h: number;
  /** Umbral de alerta del fallback rate. Default 0.10 (10%). */
  fallbackAlertThreshold: number;
  /** Si fallbackRate24h >= fallbackAlertThreshold. */
  fallbackAlert: boolean;
  /** Ultima medicion del success rate de Bright Data (event MARKET_BRIGHTDATA_HEALTH). */
  brightDataSuccessRate: number | null;
  brightDataSuccessRateAt: string | null;
}

/** Coste por request del Web Unlocker contra dominios premium. Configurable
 * via env por si Bright Data ajusta tarifas. Default conservador segun
 * pricing publico (https://brightdata.com/pricing).
 */
function readPremiumPricePerRequestUsd(): number {
  const raw = process.env.BRIGHTDATA_WEB_UNLOCKER_PREMIUM_PRICE_USD;
  if (!raw) return 0.005;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0.005;
}

/** Calcula metricas operativas para `cron/market/health-check` y `/api/market/health`. */
export async function collectHealthSnapshot(options: {
  now?: Date;
} = {}): Promise<HealthCheckSnapshot> {
  const now = options.now ?? new Date();

  let workerStatus: HealthCheckSnapshot["workerStatus"] = "unconfigured";
  const client = readWorkerClient();
  if (client) {
    try {
      const health = await client.health({ requestTimeoutMs: 5_000 });
      workerStatus = health.status === "ok" ? "ok" : "degraded";
    } catch {
      workerStatus = "unreachable";
    }
  }

  const sources = getActiveSourcesV1().filter(
    (s): s is Exclude<MarketSource, "unknown"> => s !== "unknown",
  );

  const perPortal = await Promise.all(
    sources.map(async (source) => {
      const [breaker, lastRun, activeCount, lastSnapshot] = await Promise.all([
        prisma.marketCircuitBreaker.findUnique({ where: { source } }),
        prisma.marketCrawlRun.findFirst({
          where: { source },
          orderBy: { startedAt: "desc" },
          select: { startedAt: true, status: true },
        }),
        prisma.marketListing.count({
          where: { source, status: "active" },
        }),
        prisma.marketSnapshotIndex.findFirst({
          where: {},
          orderBy: { freshAt: "desc" },
          select: { freshAt: true },
        }),
      ]);

      const freshnessSeconds = lastSnapshot
        ? Math.round((now.getTime() - lastSnapshot.freshAt.getTime()) / 1000)
        : null;

      return {
        source,
        breakerStatus: breaker?.status ?? "CLOSED",
        failureCount: breaker?.failureCount ?? 0,
        lastCrawlAt: lastRun?.startedAt.toISOString() ?? null,
        lastCrawlStatus: lastRun?.status ?? null,
        activeListings: activeCount,
        snapshotFreshAt: lastSnapshot?.freshAt.toISOString() ?? null,
        freshnessSeconds,
      };
    }),
  );

  const idealistaOn =
    process.env.MARKET_IDEALISTA_ENABLED === "true" ||
    process.env.MARKET_IDEALISTA_ENABLED === "1";
  const idealistaMetrics = idealistaOn ? await collectIdealistaMetrics(now) : undefined;

  return {
    workerStatus,
    perPortal,
    idealista: idealistaMetrics,
    generatedAt: now.toISOString(),
  };
}

/**
 * Calcula metricas Idealista para `/platform/market/health` y para alertas
 * (decisiones.md §11.5). Solo se invoca si MARKET_IDEALISTA_ENABLED=true.
 */
export async function collectIdealistaMetrics(now: Date = new Date()): Promise<IdealistaMetrics> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  const last24hStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const costAlertThreshold = Number(process.env.MARKET_IDEALISTA_COST_ALERT_USD ?? "40") || 40;
  const fallbackAlertThreshold =
    Number(process.env.MARKET_IDEALISTA_FALLBACK_ALERT_RATIO ?? "0.10") || 0.10;
  const pricePerRequest = readPremiumPricePerRequestUsd();

  // Coste mensual: sum(pagesScanned) en runs source_d del mes corriente.
  // Aproxima 1 pagina = 1 request al Web Unlocker. Si bajo la chain hay
  // fallback al residencial, el coste real es algo mas alto que esta cifra,
  // pero la estimacion sirve para alerta temprana (umbral conservador).
  const monthAgg = await prisma.marketCrawlRun.aggregate({
    where: { source: "source_d", startedAt: { gte: monthStart } },
    _sum: { pagesScanned: true },
  });
  const monthRequests = monthAgg._sum.pagesScanned ?? 0;
  const monthCostUsd = Number((monthRequests * pricePerRequest).toFixed(2));

  // Fallback rate 24h.
  const last24hRuns = await prisma.marketCrawlRun.findMany({
    where: { source: "source_d", startedAt: { gte: last24hStart } },
    select: { blockedCount: true },
  });
  const totalRuns24h = last24hRuns.length;
  const fallbackRunCount = last24hRuns.filter((r) => r.blockedCount > 0).length;
  const fallbackRate24h = totalRuns24h > 0 ? fallbackRunCount / totalRuns24h : 0;

  // Success rate ultimo conocido (cron diario brightdata-success-rate).
  const lastBdEvent = await prisma.marketEvent.findFirst({
    where: {
      source: "source_d",
      type: "MARKET_SNAPSHOT_REFRESHED",
      fingerprint: { startsWith: "brightdata-success-rate:idealista.com:" },
    },
    orderBy: { occurredAt: "desc" },
    select: { occurredAt: true, payload: true },
  });
  let brightDataSuccessRate: number | null = null;
  if (lastBdEvent?.payload && typeof lastBdEvent.payload === "object") {
    const p = lastBdEvent.payload as Record<string, unknown>;
    if (typeof p.successRate === "number") {
      brightDataSuccessRate = p.successRate;
    }
  }

  return {
    enabled: true,
    monthRequests,
    monthCostUsd,
    costAlertThreshold,
    costAlert: monthCostUsd >= costAlertThreshold,
    fallbackRate24h: Number(fallbackRate24h.toFixed(4)),
    totalRuns24h,
    fallbackAlertThreshold,
    fallbackAlert: fallbackRate24h >= fallbackAlertThreshold,
    brightDataSuccessRate,
    brightDataSuccessRateAt: lastBdEvent?.occurredAt.toISOString() ?? null,
  };
}
