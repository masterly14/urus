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

function isRateLimitError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.message.includes("408") || err.message.includes("límite de peticiones");
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
 * Obtiene ficha por cod_ofer con reintentos separados para:
 *   - Errores de red/timeout → reintento rápido (5s)
 *   - Rate limit 408 → pausa larga (2 min) para que la ventana se vacíe
 */
async function getPropertyWithRetry(
  client: InmovillaRestClient,
  codigo: string,
): Promise<PropiedadCompleta | null> {
  let networkAttempts = 0;
  let rateLimitAttempts = 0;

  while (true) {
    try {
      return await getProperty(client, codigo);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      if (isRateLimitError(err)) {
        rateLimitAttempts++;
        if (rateLimitAttempts >= MAX_RATE_LIMIT_RETRIES) {
          console.error(
            `[ingestion:properties] cod_ofer=${codigo} — rate limit tras ${rateLimitAttempts} esperas, abortando batch`,
          );
          throw err;
        }
        const waitSec = Math.round(RATE_LIMIT_WAIT_MS / 1000);
        console.warn(
          `[ingestion:properties] cod_ofer=${codigo} — 408 rate limit, esperando ${waitSec}s (intento ${rateLimitAttempts}/${MAX_RATE_LIMIT_RETRIES})...`,
        );
        await delay(RATE_LIMIT_WAIT_MS);
        continue;
      }

      networkAttempts++;
      if (networkAttempts >= MAX_NETWORK_RETRIES) {
        console.error(
          `[ingestion:properties] cod_ofer=${codigo} omitida tras ${networkAttempts} errores de red: ${msg}`,
        );
        return null;
      }
      console.warn(
        `[ingestion:properties] cod_ofer=${codigo} error red ${networkAttempts}/${MAX_NETWORK_RETRIES}: ${msg}`,
      );
      await delay(NETWORK_RETRY_DELAY_MS);
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
): Promise<InmovillaProperty[]> {
  const client = createInmovillaRestClient();

  console.log("[ingestion:properties] Solicitando listado REST...");
  const listado = await fetchPropertyList(client);
  console.log(`[ingestion:properties] Listado recibido: ${listado.length} propiedades`);

  const { toFetch, unchanged } = listadoDiff(listado, previousSnapshot);
  console.log(
    `[ingestion:properties] Análisis: ${toFetch.length} a pedir ficha completa, ${unchanged.size} sin cambios`,
  );

  if (toFetch.length > 0) {
    const estimatedMinutes = Math.ceil(
      (toFetch.length * REST_PROPERTY_FETCH_INTERVAL_MS) / 60_000,
    );
    console.log(
      `[ingestion:properties] Tiempo estimado: ~${estimatedMinutes} min (rate limit: 50 prop/10min, intervalo ${REST_PROPERTY_FETCH_INTERVAL_MS / 1000}s)`,
    );
  }

  const currentProperties: InmovillaProperty[] = [];
  let fetched = 0;
  let failed = 0;

  for (let i = 0; i < toFetch.length; i++) {
    const codigo = toFetch[i];
    console.log(
      `[ingestion:properties] [${i + 1}/${toFetch.length}] GET cod_ofer=${codigo}...`,
    );

    try {
      const full = await getPropertyWithRetry(client, codigo);
      if (full) {
        currentProperties.push(normalizePropertyFromRest(full));
        fetched++;
        console.log(`[ingestion:properties] [${i + 1}/${toFetch.length}] OK`);
      } else {
        failed++;
      }
    } catch (err) {
      if (isRateLimitError(err)) {
        console.error(
          `[ingestion:properties] Rate limit persistente — guardando ${fetched} propiedades obtenidas hasta ahora y terminando batch`,
        );
        break;
      }
      failed++;
    }

    if (i < toFetch.length - 1) {
      await delay(REST_PROPERTY_FETCH_INTERVAL_MS);
    }
  }

  console.log(
    `[ingestion:properties] Fichas: ${fetched} OK, ${failed} fallidas, ${unchanged.size} sin cambios`,
  );

  for (const [, data] of unchanged) {
    currentProperties.push(snapshotToProperty(data));
  }

  return currentProperties;
}

export async function runPropertiesIngestionCycle(): Promise<IngestionCycleResult> {
  const cycleId = randomUUID();
  const startedAt = new Date();

  console.log(`[ingestion:properties] Ciclo ${cycleId} iniciado`);

  const useRest = Boolean(
    typeof process !== "undefined" && process.env?.INMOVILLA_API_TOKEN,
  );

  try {
    let properties: InmovillaProperty[];

    console.log("[ingestion:properties] Cargando snapshot previo...");
    const previousSnapshot = await loadPreviousSnapshot();
    console.log(
      `[ingestion:properties] Snapshot previo: ${previousSnapshot.size} propiedades`,
    );

    if (useRest) {
      console.log("[ingestion:properties] Modo API REST: listado + fichas cambiadas");
      properties = await fetchPropertiesViaRest(previousSnapshot);
      console.log(
        `[ingestion:properties] ${properties.length} propiedades (listado + fetch completas)`,
      );
    } else {
      console.log("[ingestion:properties] Modo legacy: login + paginación");
      const session = await loginToInmovilla({ headless: true });
      properties = await fetchAllProperties(session);
      console.log(
        `[ingestion:properties] ${properties.length} propiedades leídas`,
      );
    }

    console.log("[ingestion:properties] Calculando diff...");
    const diff = computePropertyDiff(properties, previousSnapshot);
    console.log(
      `[ingestion:properties] Diff: ${diff.created.length} nuevas, ${diff.modified.length} modificadas, ${diff.statusChanged.length} cambios de estado, ${diff.unchanged} sin cambios`,
    );

    const publication = await publishEventsForDiff(diff, cycleId);
    const eventsEmitted = publication.emitted;
    console.log(
      `[ingestion:properties] ${eventsEmitted} eventos emitidos`,
    );

    console.log("[ingestion:properties] Guardando snapshot actual...");
    await saveCurrentSnapshot(properties, startedAt);

    const finishedAt = new Date();
    const result: IngestionCycleResult = {
      cycleId,
      startedAt,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      propertiesRead: properties.length,
      eventsEmitted,
      diff: {
        created: diff.created.length,
        modified: diff.modified.length,
        statusChanged: diff.statusChanged.length,
        unchanged: diff.unchanged,
      },
    };

    console.log(
      `[ingestion:properties] Ciclo ${cycleId} completado en ${result.durationMs}ms`,
    );
    return result;
  } catch (err: unknown) {
    const finishedAt = new Date();
    const message =
      err instanceof Error ? err.message : String(err);

    console.error(
      `[ingestion:properties] Ciclo ${cycleId} falló: ${message}`,
    );

    return {
      cycleId,
      startedAt,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      propertiesRead: 0,
      eventsEmitted: 0,
      diff: { created: 0, modified: 0, statusChanged: 0, unchanged: 0 },
      error: message,
    };
  }
}
