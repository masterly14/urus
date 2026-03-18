/**
 * Métricas de ejecución del Ingestion Worker.
 *
 * Registra en `ingestion_cycle_metrics` los tiempos, contadores y resultado
 * de cada ciclo. El guardado es best-effort: un error aquí nunca interrumpe
 * el ciclo de ingesta principal.
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";

export type WorkerName = "properties" | "demands";
export type WorkerMode = "rest" | "legacy";

/** Tiempos por fase, en milisegundos. */
export interface PhaseTimings {
  loadSnapshot?: number;
  fetchData?: number;
  computeDiff?: number;
  publishEvents?: number;
  saveSnapshot?: number;
}

export interface CycleMetricsData {
  cycleId: string;
  worker: WorkerName;
  mode: WorkerMode;
  success: boolean;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  /** Total de items leídos/recibidos de Inmovilla */
  itemsRead: number;
  /** Items para los que se hizo fetch completo (sólo REST mode propiedades) */
  itemsFetched?: number;
  /** Items que fallaron en el fetch y se omitieron */
  itemsFailed?: number;
  /** Tamaño del snapshot previo cargado desde Neon */
  snapshotSize: number;
  eventsEmitted: number;
  diffCreated: number;
  diffModified: number;
  diffStatusChanged: number;
  diffUnchanged: number;
  errorMessage?: string;
  errorCode?: string;
  phases: PhaseTimings;
}

/**
 * Clase helper para medir fases dentro de un ciclo.
 * Uso:
 *   const timer = new PhaseTimer();
 *   // ... lógica ...
 *   const ms = timer.end(); // milisegundos transcurridos
 */
export class PhaseTimer {
  private readonly startMs: number;

  constructor() {
    this.startMs = Date.now();
  }

  /** Devuelve los milisegundos transcurridos desde la creación. */
  end(): number {
    return Date.now() - this.startMs;
  }
}

/**
 * Persiste las métricas del ciclo en la tabla `ingestion_cycle_metrics`.
 * Nunca lanza excepción; los fallos se loguean y se ignoran.
 */
export async function saveCycleMetrics(data: CycleMetricsData): Promise<void> {
  try {
    await prisma.ingestionCycleMetric.create({
      data: {
        cycleId: data.cycleId,
        worker: data.worker,
        mode: data.mode,
        success: data.success,
        startedAt: data.startedAt,
        finishedAt: data.finishedAt,
        durationMs: data.durationMs,
        itemsRead: data.itemsRead,
        itemsFetched: data.itemsFetched ?? 0,
        itemsFailed: data.itemsFailed ?? 0,
        snapshotSize: data.snapshotSize,
        eventsEmitted: data.eventsEmitted,
        diffCreated: data.diffCreated,
        diffModified: data.diffModified,
        diffStatusChanged: data.diffStatusChanged,
        diffUnchanged: data.diffUnchanged,
        errorMessage: data.errorMessage ?? null,
        errorCode: data.errorCode ?? null,
        phases: data.phases as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    // Non-blocking — un fallo en métricas no debe abortar el ciclo.
    console.error(
      "[ingestion:metrics] Error al guardar métricas del ciclo:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Devuelve las últimas N métricas de un worker, ordenadas por fecha descendente.
 * Útil para dashboards y comandos de diagnóstico.
 */
export async function getRecentMetrics(
  worker: WorkerName,
  limit = 10,
): Promise<CycleMetricsData[]> {
  const rows = await prisma.ingestionCycleMetric.findMany({
    where: { worker },
    orderBy: { startedAt: "desc" },
    take: limit,
  });

  return rows.map((r) => ({
    cycleId: r.cycleId,
    worker: r.worker as WorkerName,
    mode: r.mode as WorkerMode,
    success: r.success,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    durationMs: r.durationMs,
    itemsRead: r.itemsRead,
    itemsFetched: r.itemsFetched,
    itemsFailed: r.itemsFailed,
    snapshotSize: r.snapshotSize,
    eventsEmitted: r.eventsEmitted,
    diffCreated: r.diffCreated,
    diffModified: r.diffModified,
    diffStatusChanged: r.diffStatusChanged,
    diffUnchanged: r.diffUnchanged,
    errorMessage: r.errorMessage ?? undefined,
    errorCode: r.errorCode ?? undefined,
    phases: (r.phases ?? {}) as PhaseTimings,
  }));
}
