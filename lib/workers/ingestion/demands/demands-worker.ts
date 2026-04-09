import { randomUUID } from "crypto";
import { loginToInmovilla } from "@/lib/inmovilla/auth/login";
import { fetchAllDemands } from "@/lib/inmovilla/api/demands";
import {
  loadPreviousDemandSnapshot,
  saveCurrentDemandSnapshot,
} from "./snapshot-repo";
import { computeDemandDiff } from "./demands-diff";
import { publishDemandEventsForDiff } from "./event-publisher";
import type { DemandIngestionCycleResult } from "./types";
import { demandsLogger } from "../logger";
import { classifyError } from "../errors";
import { saveCycleMetrics, PhaseTimer } from "../metrics";
import type { PhaseTimings } from "../metrics";
import {
  persistWorkerExecutionMetric,
  runWithWorkerObservability,
} from "@/lib/observability";

export async function runDemandsIngestionCycle(): Promise<DemandIngestionCycleResult> {
  const cycleId = randomUUID();
  const startedAt = new Date();
  const log = demandsLogger.child({ cycleId });
  const phases: PhaseTimings = {};

  return runWithWorkerObservability(
    {
      source: "worker",
      operation: "ingestion:demands",
      workerName: "ingestion:demands",
      workerId: cycleId,
      cycleId,
    },
    async () => {
      log.info("Ciclo iniciado", { mode: "legacy" });

      try {
        // ── Fase 1: login + lectura de demandas ──────────────────────────────
        let t = new PhaseTimer();
        log.info("Iniciando login en Inmovilla...");
        const session = await loginToInmovilla({ headless: true });

        log.info("Leyendo demandas...");
        const demands = await fetchAllDemands(session);
        phases.fetchData = t.end();
        log.phase("fetchData", phases.fetchData, { demandsRead: demands.length });

        // ── Fase 2: cargar snapshot previo ────────────────────────────────────
        t = new PhaseTimer();
        log.info("Cargando snapshot previo...");
        const previousSnapshot = await loadPreviousDemandSnapshot();
        phases.loadSnapshot = t.end();
        log.phase("loadSnapshot", phases.loadSnapshot, {
          snapshotSize: previousSnapshot.size,
        });

        // ── Fase 3: calcular diff ─────────────────────────────────────────────
        t = new PhaseTimer();
        log.info("Calculando diff...");
        const diff = computeDemandDiff(demands, previousSnapshot);
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
        const publication = await publishDemandEventsForDiff(diff, cycleId);
        const eventsEmitted = publication.emitted;
        phases.publishEvents = t.end();
        log.phase("publishEvents", phases.publishEvents, { eventsEmitted });

        // ── Fase 5: guardar snapshot ──────────────────────────────────────────
        t = new PhaseTimer();
        log.info("Guardando snapshot actual...");
        await saveCurrentDemandSnapshot(demands, startedAt);
        phases.saveSnapshot = t.end();
        log.phase("saveSnapshot", phases.saveSnapshot);

        const finishedAt = new Date();
        const durationMs = finishedAt.getTime() - startedAt.getTime();

        const result: DemandIngestionCycleResult = {
          cycleId,
          startedAt,
          finishedAt,
          durationMs,
          demandsRead: demands.length,
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
          demandsRead: demands.length,
          eventsEmitted,
          diff: result.diff,
        });

        await saveCycleMetrics({
          cycleId,
          worker: "demands",
          mode: "legacy",
          success: true,
          startedAt,
          finishedAt,
          durationMs,
          itemsRead: demands.length,
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
          operation: "ingestion:demands",
          name: "ingestion_cycle",
          success: true,
          startedAt,
          finishedAt,
          durationMs,
          throughputCount: demands.length,
          workerId: cycleId,
          workerName: "ingestion:demands",
          context: {
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
          worker: "demands",
          mode: "legacy",
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
          operation: "ingestion:demands",
          name: "ingestion_cycle",
          success: false,
          startedAt,
          finishedAt,
          durationMs,
          throughputCount: 0,
          workerId: cycleId,
          workerName: "ingestion:demands",
          errorMessage: classified.message,
          errorCode: classified.code,
          context: {
            retryable: classified.retryable,
          },
        });

        return {
          cycleId,
          startedAt,
          finishedAt,
          durationMs,
          demandsRead: 0,
          eventsEmitted: 0,
          diff: { created: 0, modified: 0, statusChanged: 0, unchanged: 0 },
          error: classified.message,
        };
      }
    },
  );
}
