import { randomUUID } from "crypto";
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
import { loginToInmovilla } from "@/lib/inmovilla/auth/login";
import { fetchAllProperties } from "@/lib/inmovilla/api/properties";
import { loadPreviousSnapshot, saveCurrentSnapshot } from "./snapshot-repo";
import type { SnapshotMap } from "./snapshot-repo";
import { computePropertyDiff } from "./properties-diff";
import { publishEventsForDiff } from "./event-publisher";
import type { IngestionCycleResult, PropertySnapshotData } from "./types";
import { propertiesLogger } from "./logger";
import { classifyError, isRateLimitError } from "./errors";
import { saveCycleMetrics, PhaseTimer } from "./metrics";
import type { PhaseTimings } from "./metrics";

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
    const codigo = String(item.cod_ofer);
    const prev = previousSnapshot.get(codigo);
    const fechaact = item.fechaact ?? "";

    if (!prev || prev.fechaActualizacion !== fechaact) {
      toFetch.push(codigo);
    } else {
      unchanged.set(codigo, prev);
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
): Promise<{
  properties: InmovillaProperty[];
  fetched: number;
  failed: number;
  totalRetries: number;
}> {
  const client = createInmovillaRestClient();

  log.info("Solicitando listado REST...");
  const listado = await fetchPropertyList(client);
  log.info("Listado recibido", { total: listado.length });

  const { toFetch, unchanged } = listadoDiff(listado, previousSnapshot);
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

  for (let i = 0; i < toFetch.length; i++) {
    const codigo = toFetch[i];
    log.debug(`[${i + 1}/${toFetch.length}] GET cod_ofer=${codigo}`);

    try {
      const { result, retries } = await getPropertyWithRetry(client, codigo, log);
      totalRetries += retries;

      if (result) {
        currentProperties.push(normalizePropertyFromRest(result));
        fetched++;
        log.debug(`[${i + 1}/${toFetch.length}] OK`, { codigo, retries });
      } else {
        failed++;
      }
    } catch (err) {
      if (isRateLimitError(err)) {
        log.error(
          "Rate limit persistente — guardando propiedades obtenidas hasta ahora y terminando batch",
          err,
          { fetchedSoFar: fetched },
        );
        break;
      }
      failed++;
    }

    if (i < toFetch.length - 1) {
      await delay(REST_PROPERTY_FETCH_INTERVAL_MS);
    }
  }

  log.info("Fichas completadas", {
    fetched,
    failed,
    unchanged: unchanged.size,
    totalRetries,
  });

  for (const [, data] of unchanged) {
    currentProperties.push(snapshotToProperty(data));
  }

  return { properties: currentProperties, fetched, failed, totalRetries };
}

export async function runPropertiesIngestionCycle(): Promise<IngestionCycleResult> {
  const cycleId = randomUUID();
  const startedAt = new Date();
  const log = propertiesLogger.child({ cycleId });
  const phases: PhaseTimings = {};

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

    // ── Fase 2: leer propiedades ──────────────────────────────────────────
    t = new PhaseTimer();
    let properties: InmovillaProperty[];
    let itemsFetched = 0;
    let itemsFailed = 0;

    if (useRest) {
      log.info("Modo API REST: listado + fichas cambiadas");
      const restResult = await fetchPropertiesViaRest(previousSnapshot, log);
      properties = restResult.properties;
      itemsFetched = restResult.fetched;
      itemsFailed = restResult.failed;
      log.info("Propiedades REST cargadas", {
        total: properties.length,
        fetched: itemsFetched,
        failed: itemsFailed,
        retries: restResult.totalRetries,
      });
    } else {
      log.info("Modo legacy: login + paginación");
      const session = await loginToInmovilla({ headless: true });
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
      unchanged: diff.unchanged,
    });

    // ── Fase 4: publicar eventos ──────────────────────────────────────────
    t = new PhaseTimer();
    log.info("Publicando eventos...");
    const publication = await publishEventsForDiff(diff, cycleId);
    const eventsEmitted = publication.emitted;
    phases.publishEvents = t.end();
    log.phase("publishEvents", phases.publishEvents, { eventsEmitted });

    // ── Fase 5: guardar snapshot ──────────────────────────────────────────
    t = new PhaseTimer();
    log.info("Guardando snapshot actual...");
    await saveCurrentSnapshot(properties, startedAt);
    phases.saveSnapshot = t.end();
    log.phase("saveSnapshot", phases.saveSnapshot);

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
        unchanged: diff.unchanged,
      },
    };

    log.info("Ciclo completado", {
      durationMs,
      propertiesRead: properties.length,
      eventsEmitted,
      diff: result.diff,
    });

    // Persistir métricas de forma no bloqueante
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

    return {
      cycleId,
      startedAt,
      finishedAt,
      durationMs,
      propertiesRead: 0,
      eventsEmitted: 0,
      diff: { created: 0, modified: 0, statusChanged: 0, unchanged: 0 },
      error: classified.message,
    };
  }
}
