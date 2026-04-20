/**
 * Worker de enriquecimiento: sincroniza `portalUrl` y `portalName` en
 * `properties_current` consumiendo `GET /propiedades/?extrainfo&cod_ofer=`.
 *
 * A diferencia del ciclo de ingestión principal, este worker **no pasa por
 * eventos**: actualiza directamente `properties_current` porque el link al
 * portal es información de enriquecimiento (no un cambio de estado del
 * agregado Property). Esto evita duplicar lógica en el event store y
 * simplifica idempotencia.
 *
 * Orden de prioridad de portales (configurado en `selectPrimaryPortal`):
 *   Idealista > Fotocasa > Pisos.com > Habitaclia > resto
 *
 * Rate limit y presupuesto de tiempo:
 *   - Comparte cuota con el fetcher principal (5 req/min efectivos para
 *     `/propiedades/`). Usamos intervalo de 13s igual que properties-worker.
 *   - Checkpoint + time-budget para ejecutar dentro de los 300s de maxDuration
 *     en Vercel y reanudar en la siguiente invocación.
 *
 * Selección de candidatas (orden):
 *   1. Propiedades activas (`nodisponible=false`) sin `portalSyncedAt` (nunca sync).
 *   2. Propiedades cuyo `portalSyncedAt` sea anterior a `SYNC_REFRESH_HOURS`.
 */

import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { createInmovillaRestClient } from "@/lib/inmovilla/rest/client";
import {
  getPropertyExtraInfo,
  selectPrimaryPortal,
} from "@/lib/inmovilla/rest/properties";
import { propertiesLogger } from "./logger";
import { classifyError, isRateLimitError } from "./errors";
import { alertGeneric } from "@/lib/alerts";
import {
  persistWorkerExecutionMetric,
  runWithWorkerObservability,
} from "@/lib/observability";

const CHECKPOINT_KEY = "ingestion:extrainfo:pendingCodes";

const REST_PROPERTY_FETCH_INTERVAL_MS = 13_000;
const MAX_PROPERTIES_PER_RUN = Number.isFinite(
  Number(process.env.EXTRAINFO_MAX_PER_RUN),
)
  ? Math.max(1, Number(process.env.EXTRAINFO_MAX_PER_RUN))
  : 20;
const TIME_BUDGET_MARGIN_MS = 30_000;
const MAX_DURATION_MS = 300_000;

const MAX_NETWORK_RETRIES = 3;
const NETWORK_RETRY_DELAY_MS = 5_000;
const MAX_RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_WAIT_MS = 120_000;

/**
 * Cada cuánto se considera "obsoleta" una sincronización previa y se vuelve a
 * intentar. 7 días es un buen equilibrio: las propiedades no cambian de URL
 * en portales con frecuencia, y dejamos margen para capturar cambios editoriales.
 */
const SYNC_REFRESH_HOURS = 24 * 7;

export type ExtrainfoCycleResult = {
  cycleId: string;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  candidatesConsidered: number;
  propertiesProcessed: number;
  propertiesWithPortal: number;
  propertiesWithoutPortal: number;
  propertiesFailed: number;
  fetchComplete: boolean;
  error?: string;
  errorCode?: string;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadCheckpoint(): Promise<string[] | null> {
  const rows = await prisma.$queryRaw<
    Array<{ value: string }>
  >`SELECT "value" FROM "kv_store" WHERE "key" = ${CHECKPOINT_KEY} LIMIT 1`;
  if (rows.length === 0) return null;
  try {
    const parsed = JSON.parse(rows[0].value) as { pendingCodes?: string[] };
    if (Array.isArray(parsed.pendingCodes)) return parsed.pendingCodes;
    return null;
  } catch {
    return null;
  }
}

async function saveCheckpoint(pendingCodes: string[]): Promise<void> {
  const value = JSON.stringify({ pendingCodes });
  await prisma.$executeRaw`
    INSERT INTO "kv_store" ("key", "value", "updatedAt")
    VALUES (${CHECKPOINT_KEY}, ${value}::text, NOW())
    ON CONFLICT ("key")
    DO UPDATE SET "value" = ${value}::text, "updatedAt" = NOW()
  `;
}

async function clearCheckpoint(): Promise<void> {
  await prisma.$executeRaw`
    DELETE FROM "kv_store" WHERE "key" = ${CHECKPOINT_KEY}
  `;
}

async function loadCandidates(): Promise<string[]> {
  const refreshBefore = new Date(Date.now() - SYNC_REFRESH_HOURS * 3_600_000);

  const rows = await prisma.propertyCurrent.findMany({
    where: {
      nodisponible: false,
      prospecto: false,
      OR: [
        { portalSyncedAt: null },
        { portalSyncedAt: { lt: refreshBefore } },
      ],
    },
    select: { codigo: true },
    orderBy: [
      { portalSyncedAt: { sort: "asc", nulls: "first" } },
      { updatedAt: "desc" },
    ],
  });

  return rows.map((r) => r.codigo);
}

async function fetchExtraInfoWithRetry(
  client: ReturnType<typeof createInmovillaRestClient>,
  codigo: string,
  log: ReturnType<typeof propertiesLogger.child>,
): Promise<Awaited<ReturnType<typeof getPropertyExtraInfo>> | "skip"> {
  let networkAttempts = 0;
  let rateLimitAttempts = 0;

  while (true) {
    try {
      return await getPropertyExtraInfo(client, codigo);
    } catch (err) {
      const classified = classifyError(err);

      if (classified.code === "RATE_LIMIT") {
        rateLimitAttempts++;
        if (rateLimitAttempts >= MAX_RATE_LIMIT_RETRIES) {
          log.error(
            `cod_ofer=${codigo} — rate limit persistente tras ${rateLimitAttempts} esperas, abortando batch`,
            err,
          );
          throw classified;
        }
        const waitSec = Math.round(RATE_LIMIT_WAIT_MS / 1000);
        log.warn(`cod_ofer=${codigo} — rate limit 408, esperando ${waitSec}s`, {
          attempt: rateLimitAttempts,
          maxAttempts: MAX_RATE_LIMIT_RETRIES,
        });
        await delay(RATE_LIMIT_WAIT_MS);
        continue;
      }

      if (classified.retryable) {
        networkAttempts++;
        if (networkAttempts >= MAX_NETWORK_RETRIES) {
          log.error(
            `cod_ofer=${codigo} omitida tras ${networkAttempts} errores de red`,
            err,
            { errorCode: classified.code },
          );
          return "skip";
        }
        log.warn(`cod_ofer=${codigo} — error de red, reintentando`, {
          attempt: networkAttempts,
          maxAttempts: MAX_NETWORK_RETRIES,
          errorCode: classified.code,
        });
        await delay(NETWORK_RETRY_DELAY_MS);
        continue;
      }

      log.warn(`cod_ofer=${codigo} omitida por error no reintentable`, {
        errorCode: classified.code,
        error: classified.message,
      });
      return "skip";
    }
  }
}

async function persistExtraInfo(
  codigo: string,
  portalUrl: string | null,
  portalName: string | null,
): Promise<void> {
  await prisma.propertyCurrent.update({
    where: { codigo },
    data: {
      portalUrl,
      portalName,
      portalSyncedAt: new Date(),
    },
  });
}

export async function runExtrainfoIngestionCycle(): Promise<ExtrainfoCycleResult> {
  const cycleId = randomUUID();
  const startedAt = new Date();
  const log = propertiesLogger.child({ cycleId, component: "extrainfo" });

  return runWithWorkerObservability(
    {
      source: "worker",
      operation: "ingestion:extrainfo",
      workerName: "ingestion:extrainfo",
      workerId: cycleId,
      cycleId,
    },
    async () => {
      log.info("Ciclo extrainfo iniciado");

      let propertiesProcessed = 0;
      let propertiesWithPortal = 0;
      let propertiesWithoutPortal = 0;
      let propertiesFailed = 0;
      let fetchComplete = true;
      let candidatesConsidered = 0;
      let error: string | undefined;
      let errorCode: string | undefined;

      try {
        const checkpointCodes = await loadCheckpoint();
        let toFetch: string[];

        if (checkpointCodes && checkpointCodes.length > 0) {
          toFetch = checkpointCodes;
          log.info("Reanudando desde checkpoint", { pending: toFetch.length });
        } else {
          toFetch = await loadCandidates();
          log.info("Candidatas seleccionadas", {
            total: toFetch.length,
            criterio: `portalSyncedAt IS NULL OR < ${SYNC_REFRESH_HOURS}h`,
          });
        }

        candidatesConsidered = toFetch.length;

        if (toFetch.length === 0) {
          log.info("Sin candidatas a sincronizar — nada que hacer");
          await clearCheckpoint();
          const finishedAt = new Date();
          return {
            cycleId,
            startedAt,
            finishedAt,
            durationMs: finishedAt.getTime() - startedAt.getTime(),
            candidatesConsidered,
            propertiesProcessed: 0,
            propertiesWithPortal: 0,
            propertiesWithoutPortal: 0,
            propertiesFailed: 0,
            fetchComplete: true,
          };
        }

        const client = createInmovillaRestClient();
        const limit = Math.min(toFetch.length, MAX_PROPERTIES_PER_RUN);
        let lastProcessedIndex = -1;

        for (let i = 0; i < limit; i++) {
          const elapsed = Date.now() - startedAt.getTime();
          if (elapsed > MAX_DURATION_MS - TIME_BUDGET_MARGIN_MS) {
            log.warn("Time-budget agotado — guardando checkpoint", {
              elapsedMs: elapsed,
              processed: i,
              remaining: toFetch.length - i,
            });
            fetchComplete = false;
            break;
          }

          const codigo = toFetch[i];
          log.debug(`[${i + 1}/${limit}] extrainfo cod_ofer=${codigo}`);

          try {
            const extraInfo = await fetchExtraInfoWithRetry(client, codigo, log);

            if (extraInfo === "skip") {
              propertiesFailed++;
            } else {
              const primary = selectPrimaryPortal(extraInfo?.publishinfo);
              if (primary) {
                await persistExtraInfo(codigo, primary.portalUrl, primary.portalName);
                propertiesWithPortal++;
                log.debug(`[${i + 1}/${limit}] OK`, {
                  codigo,
                  portal: primary.portalName,
                  urlPreview: primary.portalUrl.slice(0, 60),
                });
              } else {
                await persistExtraInfo(codigo, null, null);
                propertiesWithoutPortal++;
                log.debug(`[${i + 1}/${limit}] Sin publication_url`, { codigo });
              }
              propertiesProcessed++;
            }

            lastProcessedIndex = i;
          } catch (err) {
            if (isRateLimitError(err)) {
              fetchComplete = false;
              log.error("Rate limit persistente — batch cortado", err, {
                processedSoFar: propertiesProcessed,
              });
              alertGeneric(
                "Ingesta extrainfo: batch cortado por rate limit persistente",
                "warning",
                {
                  processedSoFar: propertiesProcessed,
                  totalCandidates: toFetch.length,
                  failedIndex: i,
                  lastCodigo: codigo,
                },
              ).catch(() => {});
              break;
            }
            propertiesFailed++;
            lastProcessedIndex = i;
          }

          if (i < limit - 1) {
            await delay(REST_PROPERTY_FETCH_INTERVAL_MS);
          }
        }

        const remainingCodes = toFetch.slice(lastProcessedIndex + 1);
        if (remainingCodes.length > 0) {
          fetchComplete = false;
          await saveCheckpoint(remainingCodes);
          log.info("Checkpoint guardado", { remaining: remainingCodes.length });
        } else {
          await clearCheckpoint();
        }

        log.info("Ciclo extrainfo completado", {
          propertiesProcessed,
          propertiesWithPortal,
          propertiesWithoutPortal,
          propertiesFailed,
          fetchComplete,
        });
      } catch (err) {
        const classified = classifyError(err);
        error = classified.message;
        errorCode = classified.code;
        log.error("Ciclo extrainfo fallido", err, { errorCode });
      }

      const finishedAt = new Date();
      const result: ExtrainfoCycleResult = {
        cycleId,
        startedAt,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        candidatesConsidered,
        propertiesProcessed,
        propertiesWithPortal,
        propertiesWithoutPortal,
        propertiesFailed,
        fetchComplete,
        error,
        errorCode,
      };

      persistWorkerExecutionMetric({
        source: "worker",
        operation: "ingestion:extrainfo",
        workerName: "ingestion:extrainfo",
        workerId: cycleId,
        cycleId,
        name: "ingestion:extrainfo:cycle",
        success: !error,
        startedAt,
        finishedAt,
        durationMs: result.durationMs,
        throughputCount: propertiesProcessed,
        errorMessage: error,
        errorCode,
        context: {
          candidatesConsidered,
          propertiesWithPortal,
          propertiesWithoutPortal,
          propertiesFailed,
          fetchComplete,
        },
      }).catch(() => {});

      return result;
    },
  );
}
