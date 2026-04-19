import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { createInmovillaRestClient } from "@/lib/inmovilla/rest/client";
import {
  fetchPropertyList,
  getProperty,
  normalizePropertyFromRest,
} from "@/lib/inmovilla/rest/properties";
import type { PropiedadListadoItem } from "@/lib/inmovilla/rest/types";
import type { InmovillaRestClient } from "@/lib/inmovilla/rest/client";
import type { PropiedadCompleta } from "@/lib/inmovilla/rest/types";
import type { InmovillaProperty } from "@/lib/inmovilla/api/types";
import { loadSessionFromDb, saveSessionToDb } from "@/lib/inmovilla/auth/session-store";
import { fetchAllProperties } from "@/lib/inmovilla/api/properties";
import { loadEnumLookupMaps, type EnumLookupMaps } from "@/lib/inmovilla/rest/enum-lookup";
import { loadPreviousSnapshot, saveCurrentSnapshot, removeFromSnapshot } from "./snapshot-repo";
import type { SnapshotMap } from "./snapshot-repo";
import { computePropertyDiff } from "./properties-diff";
import { publishEventsForDiff } from "./event-publisher";
import type { IngestionCycleResult, PropertySnapshotData } from "./types";
import { propertiesLogger } from "./logger";
import { classifyError, isRateLimitError } from "./errors";
import { alertGeneric } from "@/lib/alerts";
import { saveCycleMetrics, PhaseTimer } from "./metrics";
import type { PhaseTimings } from "./metrics";
import {
  persistWorkerExecutionMetric,
  runWithWorkerObservability,
} from "@/lib/observability";

// ---------------------------------------------------------------------------
// H6: Ingestion checkpoint — persiste el índice del último código procesado
// para que la siguiente invocación del cron continúe desde donde quedó en vez
// de re-empezar de cero. Se almacena en una tabla ligera key-value.
// ---------------------------------------------------------------------------
const CHECKPOINT_KEY = "ingestion:properties:fetchIndex";

async function loadCheckpoint(): Promise<{ pendingCodes: string[] } | null> {
  const rows = await prisma.$queryRaw<
    Array<{ value: string }>
  >`SELECT "value" FROM "kv_store" WHERE "key" = ${CHECKPOINT_KEY} LIMIT 1`;
  if (rows.length === 0) return null;
  try {
    return JSON.parse(rows[0].value) as { pendingCodes: string[] };
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

/**
 * Rate limits Inmovilla REST para propiedades (doc):
 *   - 10 por minuto
 *   - 50 por 10 minutos
 *
 * El límite más restrictivo es 50/10min = 5/min = 1 cada 12s.
 * Usamos 13s de intervalo para margen de seguridad.
 * El listado (GET /propiedades/?listado) TAMBIÉN cuenta como 1 petición.
 */
const REST_PROPERTY_FETCH_INTERVAL_MS = 13_000;

/**
 * H6: máximo de propiedades a fetchear por invocación del cron.
 * Con 13s de intervalo, 20 fichas ≈ 260s, dejando margen dentro de los 300s
 * de maxDuration de Vercel. Fichas restantes se procesan en la siguiente
 * invocación gracias al checkpoint (ver `IngestionCheckpoint`).
 */
const MAX_PROPERTIES_PER_RUN = 20;

/**
 * H6: time-budget — si queda menos de este margen antes del maxDuration
 * de Vercel (300s), el loop se detiene y guarda checkpoint.
 * 30s de margen para snapshot + diff + publish + métricas.
 */
const TIME_BUDGET_MARGIN_MS = 30_000;

/** Máx. reintentos para errores de red/timeout (no rate limit). */
const MAX_NETWORK_RETRIES = 3;
/** Pausa entre reintentos de red (ms). */
const NETWORK_RETRY_DELAY_MS = 5_000;

/** Máx. reintentos ante 408 rate limit antes de abortar el batch. */
const MAX_RATE_LIMIT_RETRIES = 3;
/** Pausa ante 408 rate limit: 2 minutos para que la ventana se vacíe. */
const RATE_LIMIT_WAIT_MS = 120_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function snapshotToProperty(s: PropertySnapshotData): InmovillaProperty {
  return { ...s, raw: {} };
}

function listadoDiff(
  listado: PropiedadListadoItem[],
  previousSnapshot: SnapshotMap,
): { toFetch: string[]; unchanged: Map<string, PropertySnapshotData> } {
  const toFetch: string[] = [];
  const unchanged = new Map<string, PropertySnapshotData>();

  for (const item of listado) {
    // Pre-filtro temprano: si Inmovilla ya marca la propiedad como no disponible
    // o como prospecto en el listado, no vale la pena ni fetchear la ficha completa.
    if (item.nodisponible || item.prospecto) continue;

    const codigo = String(item.cod_ofer);
    const prev = previousSnapshot.get(codigo);
    const fechaact = item.fechaact ?? "";

    if (!prev || prev.fechaActualizacion !== fechaact) {
      toFetch.push(codigo);
    } else {
      // Solo incluir en unchanged si estaba marcada como Libre en el snapshot anterior.
      // Si tenía otro estado, se re-fetcha para confirmar su estado actual.
      if (prev.estado === "Libre") {
        unchanged.set(codigo, prev);
      } else {
        toFetch.push(codigo);
      }
    }
  }

  return { toFetch, unchanged };
}

/**
 * Obtiene ficha por cod_ofer con reintentos diferenciados:
 *   - Errores de red/timeout → reintento rápido (5s)
 *   - Rate limit 408 → pausa larga (2 min) para que la ventana se vacíe
 *
 * Devuelve stats de reintentos para las métricas del ciclo.
 */
async function getPropertyWithRetry(
  client: InmovillaRestClient,
  codigo: string,
  log: ReturnType<typeof propertiesLogger.child>,
): Promise<{ result: PropiedadCompleta | null; retries: number }> {
  let networkAttempts = 0;
  let rateLimitAttempts = 0;
  let totalRetries = 0;

  while (true) {
    try {
      const result = await getProperty(client, codigo);
      return { result, retries: totalRetries };
    } catch (err) {
      const classified = classifyError(err);

      if (classified.code === "RATE_LIMIT") {
        rateLimitAttempts++;
        totalRetries++;
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
        totalRetries++;
        if (networkAttempts >= MAX_NETWORK_RETRIES) {
          log.error(
            `cod_ofer=${codigo} omitida tras ${networkAttempts} errores de red`,
            err,
            { errorCode: classified.code },
          );
          return { result: null, retries: totalRetries };
        }
        log.warn(`cod_ofer=${codigo} — error de red, reintentando`, {
          attempt: networkAttempts,
          maxAttempts: MAX_NETWORK_RETRIES,
          errorCode: classified.code,
        });
        await delay(NETWORK_RETRY_DELAY_MS);
        continue;
      }

      // Error no retryable (parse, unknown, etc.) → omitir esta propiedad
      log.warn(`cod_ofer=${codigo} omitida por error no reintentable`, {
        errorCode: classified.code,
        error: classified.message,
      });
      return { result: null, retries: totalRetries };
    }
  }
}

/**
 * Obtiene propiedades vía API REST:
 *   1. GET /propiedades/?listado → listado por fechaact
 *   2. Comparar con snapshot Neon → identificar creadas/modificadas
 *   3. GET /propiedades/?cod_ofer=X solo para las cambiadas (throttle 50/10min)
 */
async function fetchPropertiesViaRest(
  previousSnapshot: SnapshotMap,
  log: ReturnType<typeof propertiesLogger.child>,
  enumMaps?: EnumLookupMaps,
  cycleStartedAt?: Date,
): Promise<{
  properties: InmovillaProperty[];
  fetched: number;
  failed: number;
  totalRetries: number;
  fetchComplete: boolean;
}> {
  const client = createInmovillaRestClient();

  log.info("Solicitando listado REST...");
  const listado = await fetchPropertyList(client);
  log.info("Listado recibido", { total: listado.length });

  const { toFetch: allToFetch, unchanged } = listadoDiff(listado, previousSnapshot);

  // H6: checkpoint — si existe un checkpoint de una invocación anterior que
  // no terminó, continuamos desde los códigos pendientes en vez de empezar
  // de cero. Esto evita que un catálogo grande quede en bucle sin avance.
  const checkpoint = await loadCheckpoint();
  let toFetch: string[];
  if (checkpoint && checkpoint.pendingCodes.length > 0) {
    const pending = new Set(checkpoint.pendingCodes);
    toFetch = allToFetch.filter((c) => pending.has(c));
    log.info("Reanudando desde checkpoint", {
      totalToFetch: allToFetch.length,
      pendingFromCheckpoint: toFetch.length,
    });
  } else {
    toFetch = allToFetch;
  }

  log.info("Análisis de cambios", {
    toFetch: toFetch.length,
    unchanged: unchanged.size,
  });

  if (toFetch.length > 0) {
    const estimatedMinutes = Math.ceil(
      (toFetch.length * REST_PROPERTY_FETCH_INTERVAL_MS) / 60_000,
    );
    log.info("Tiempo estimado para fichas completas", {
      estimatedMinutes,
      intervalSec: REST_PROPERTY_FETCH_INTERVAL_MS / 1000,
      rateLimitPolicy: "50 prop/10min",
    });
  }

  const currentProperties: InmovillaProperty[] = [];
  let fetched = 0;
  let failed = 0;
  let totalRetries = 0;
  let fetchComplete = true;
  const runStart = cycleStartedAt ?? new Date();

  // H6: el loop se acota por MAX_PROPERTIES_PER_RUN y por time-budget.
  const limit = Math.min(toFetch.length, MAX_PROPERTIES_PER_RUN);

  let lastProcessedIndex = -1;

  for (let i = 0; i < limit; i++) {
    // H6: time-budget — si queda menos de TIME_BUDGET_MARGIN_MS antes de los
    // 300s de Vercel, paramos y guardamos checkpoint con los códigos restantes.
    const elapsed = Date.now() - runStart.getTime();
    const maxDurationMs = 300_000;
    if (elapsed > maxDurationMs - TIME_BUDGET_MARGIN_MS) {
      log.warn("Time-budget agotado — guardando checkpoint", {
        elapsedMs: elapsed,
        processed: i,
        remaining: toFetch.length - i,
      });
      fetchComplete = false;
      break;
    }

    const codigo = toFetch[i];
    log.debug(`[${i + 1}/${toFetch.length}] GET cod_ofer=${codigo}`);

    try {
      const { result, retries } = await getPropertyWithRetry(client, codigo, log);
      totalRetries += retries;

      if (result) {
        const normalized = normalizePropertyFromRest(result, enumMaps);
        if (normalized.estado === "Libre") {
          currentProperties.push(normalized);
        } else {
          log.debug(`[${i + 1}/${toFetch.length}] Ignorada (estado="${normalized.estado}")`, { codigo });
        }
        fetched++;
        log.debug(`[${i + 1}/${toFetch.length}] OK`, { codigo, retries });
      } else {
        failed++;
      }
      lastProcessedIndex = i;
    } catch (err) {
      if (isRateLimitError(err)) {
        fetchComplete = false;
        log.error(
          "Rate limit persistente — fetch incompleto, snapshot NO se guardará",
          err,
          { fetchedSoFar: fetched },
        );
        alertGeneric(
          "Ingesta propiedades: batch cortado por rate limit persistente",
          "warning",
          {
            fetchedSoFar: fetched,
            totalToFetch: toFetch.length,
            failedIndex: i,
            lastCodigo: codigo,
          },
        ).catch(() => {});
        break;
      }
      failed++;
      lastProcessedIndex = i;
    }

    if (i < limit - 1) {
      await delay(REST_PROPERTY_FETCH_INTERVAL_MS);
    }
  }

  // H6: persistir o limpiar checkpoint según si quedaron fichas pendientes.
  const remainingCodes = toFetch.slice(lastProcessedIndex + 1);
  if (remainingCodes.length > 0) {
    fetchComplete = false;
    await saveCheckpoint(remainingCodes);
    log.info("Checkpoint guardado", { remaining: remainingCodes.length });
  } else {
    await clearCheckpoint();
  }

  log.info("Fichas completadas", {
    fetched,
    failed,
    unchanged: unchanged.size,
    totalRetries,
    fetchComplete,
  });

  for (const [, data] of unchanged) {
    currentProperties.push(snapshotToProperty(data));
  }

  return { properties: currentProperties, fetched, failed, totalRetries, fetchComplete };
}

export async function runPropertiesIngestionCycle(): Promise<IngestionCycleResult> {
  const cycleId = randomUUID();
  const startedAt = new Date();
  const log = propertiesLogger.child({ cycleId });
  const phases: PhaseTimings = {};

  return runWithWorkerObservability(
    {
      source: "worker",
      operation: "ingestion:properties",
      workerName: "ingestion:properties",
      workerId: cycleId,
      cycleId,
    },
    async () => {
      const useRest = Boolean(
        typeof process !== "undefined" && process.env?.INMOVILLA_API_TOKEN,
      );
      const mode = useRest ? "rest" : "legacy";

      log.info("Ciclo iniciado", { mode });

      try {
        // ── Fase 1: cargar snapshot previo ────────────────────────────────────
        let t = new PhaseTimer();
        log.info("Cargando snapshot previo...");
        const previousSnapshot = await loadPreviousSnapshot();
        phases.loadSnapshot = t.end();
        log.phase("loadSnapshot", phases.loadSnapshot, {
          snapshotSize: previousSnapshot.size,
        });

        // ── Fase 1b: cargar enum maps para resolución key_loca/key_zona/estadoficha ──
        let enumMaps: EnumLookupMaps | undefined;
        if (useRest) {
          try {
            enumMaps = await loadEnumLookupMaps();
            log.info("Enum lookup maps cargados", {
              ciudades: enumMaps.ciudadByKeyLoca.size,
              zonas: enumMaps.zonaByLocaZona.size,
              estados: enumMaps.estadoByValue.size,
            });
          } catch (err) {
            log.warn("No se pudieron cargar enum maps — ciudad/zona/estado podrían quedar como código", {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        // ── Fase 2: leer propiedades ──────────────────────────────────────────
        t = new PhaseTimer();
        let properties: InmovillaProperty[];
        let itemsFetched = 0;
        let itemsFailed = 0;

        let fetchComplete = true;

        if (useRest) {
          log.info("Modo API REST: listado + fichas cambiadas");
          const restResult = await fetchPropertiesViaRest(previousSnapshot, log, enumMaps, startedAt);
          properties = restResult.properties;
          itemsFetched = restResult.fetched;
          itemsFailed = restResult.failed;
          fetchComplete = restResult.fetchComplete;
          log.info("Propiedades REST cargadas", {
            total: properties.length,
            fetched: itemsFetched,
            failed: itemsFailed,
            retries: restResult.totalRetries,
            fetchComplete,
          });
        } else {
          log.info("Modo legacy: resolviendo sesión (DB → Playwright)");
          let session = await loadSessionFromDb();
          if (!session) {
            const { loginToInmovilla } = await import("@/lib/inmovilla/auth/login");
            session = await loginToInmovilla({ headless: true });
            await saveSessionToDb(session, "properties-legacy").catch(() => {});
          }
          properties = await fetchAllProperties(session);
          log.info("Propiedades legacy cargadas", { total: properties.length });
        }
        phases.fetchData = t.end();
        log.phase("fetchData", phases.fetchData, { itemsRead: properties.length });

        // ── Fase 3: calcular diff ─────────────────────────────────────────────
        t = new PhaseTimer();
        log.info("Calculando diff...");
        const diff = computePropertyDiff(properties, previousSnapshot);
        phases.computeDiff = t.end();
        log.phase("computeDiff", phases.computeDiff, {
          created: diff.created.length,
          modified: diff.modified.length,
          statusChanged: diff.statusChanged.length,
          removed: diff.removed.length,
          unchanged: diff.unchanged,
        });

        // ── Fase 4: guardar snapshot (ANTES de publicar eventos) ─────────────
        // Persistir primero garantiza que si la publicación falla, el siguiente
        // ciclo detectará el diff correcto sin duplicar eventos.
        // ONLY save snapshot if the fetch completed fully — a partial snapshot
        // would produce incorrect diffs in the next cycle.
        t = new PhaseTimer();
        if (fetchComplete) {
          log.info("Guardando snapshot actual...");
          await saveCurrentSnapshot(properties, startedAt);
          if (diff.removed.length > 0) {
            const removedCodes = diff.removed.map((r) => r.codigo);
            log.info("Eliminando del snapshot propiedades no-Libre", { count: removedCodes.length });
            await removeFromSnapshot(removedCodes);
          }
        } else {
          log.warn("Snapshot NO guardado: fetch incompleto por rate limit — se conserva snapshot anterior");
        }
        phases.saveSnapshot = t.end();
        log.phase("saveSnapshot", phases.saveSnapshot);

        // ── Fase 5: publicar eventos ──────────────────────────────────────────
        t = new PhaseTimer();
        log.info("Publicando eventos...");
        const publication = await publishEventsForDiff(diff, cycleId);
        const eventsEmitted = publication.emitted;
        phases.publishEvents = t.end();
        log.phase("publishEvents", phases.publishEvents, { eventsEmitted });

        const finishedAt = new Date();
        const durationMs = finishedAt.getTime() - startedAt.getTime();

        const result: IngestionCycleResult = {
          cycleId,
          startedAt,
          finishedAt,
          durationMs,
          propertiesRead: properties.length,
          eventsEmitted,
          diff: {
            created: diff.created.length,
            modified: diff.modified.length,
            statusChanged: diff.statusChanged.length,
            removed: diff.removed.length,
            unchanged: diff.unchanged,
          },
        };

        log.info("Ciclo completado", {
          durationMs,
          propertiesRead: properties.length,
          eventsEmitted,
          diff: result.diff,
        });

        await saveCycleMetrics({
          cycleId,
          worker: "properties",
          mode,
          success: true,
          startedAt,
          finishedAt,
          durationMs,
          itemsRead: properties.length,
          itemsFetched,
          itemsFailed,
          snapshotSize: previousSnapshot.size,
          eventsEmitted,
          diffCreated: diff.created.length,
          diffModified: diff.modified.length,
          diffStatusChanged: diff.statusChanged.length,
          diffUnchanged: diff.unchanged,
          phases,
        });

        await persistWorkerExecutionMetric({
          source: "worker",
          operation: "ingestion:properties",
          name: "ingestion_cycle",
          success: true,
          startedAt,
          finishedAt,
          durationMs,
          throughputCount: properties.length,
          workerId: cycleId,
          workerName: "ingestion:properties",
          context: {
            mode,
            eventsEmitted,
            diff: result.diff,
          },
        });

        return result;
      } catch (err: unknown) {
        const finishedAt = new Date();
        const durationMs = finishedAt.getTime() - startedAt.getTime();
        const classified = classifyError(err);

        log.error("Ciclo fallido", err, {
          durationMs,
          errorCode: classified.code,
          retryable: classified.retryable,
        });

        await saveCycleMetrics({
          cycleId,
          worker: "properties",
          mode,
          success: false,
          startedAt,
          finishedAt,
          durationMs,
          itemsRead: 0,
          snapshotSize: 0,
          eventsEmitted: 0,
          diffCreated: 0,
          diffModified: 0,
          diffStatusChanged: 0,
          diffUnchanged: 0,
          errorMessage: classified.message,
          errorCode: classified.code,
          phases,
        });

        await persistWorkerExecutionMetric({
          source: "worker",
          operation: "ingestion:properties",
          name: "ingestion_cycle",
          success: false,
          startedAt,
          finishedAt,
          durationMs,
          throughputCount: 0,
          workerId: cycleId,
          workerName: "ingestion:properties",
          errorMessage: classified.message,
          errorCode: classified.code,
          context: {
            mode,
            retryable: classified.retryable,
          },
        });

        return {
          cycleId,
          startedAt,
          finishedAt,
          durationMs,
          propertiesRead: 0,
          eventsEmitted: 0,
          diff: { created: 0, modified: 0, statusChanged: 0, removed: 0, unchanged: 0 },
          error: classified.message,
          errorCode: classified.code,
          retryable: classified.retryable,
        };
      }
    },
  );
}
