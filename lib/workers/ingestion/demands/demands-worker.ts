import { randomUUID } from "crypto";
import { loadSessionFromDb, saveSessionToDb } from "@/lib/inmovilla/auth/session-store";
import { fetchAllDemands } from "@/lib/inmovilla/api/demands";
import {
  loadPreviousDemandSnapshot,
  saveCurrentDemandSnapshot,
} from "./snapshot-repo";
import { computeDemandDiff } from "./demands-diff";
import { publishDemandEventsForDiff } from "./event-publisher";
import type { DemandIngestionCycleResult } from "./types";
import { demandsLogger } from "../logger";
import { classifyError, isRetryableError } from "../errors";
import { saveCycleMetrics, PhaseTimer } from "../metrics";
import type { PhaseTimings } from "../metrics";
import {
  persistWorkerExecutionMetric,
  runWithWorkerObservability,
} from "@/lib/observability";
import { alertGeneric } from "@/lib/alerts";

const LOGIN_RETRY_DELAY_MS = 10_000;
const FETCH_RETRY_DELAY_MS = 5_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
        // ── Fase 1: resolver sesión (DB-first, Playwright fallback con retry) ──
        let t = new PhaseTimer();
        log.info("Resolviendo sesión Inmovilla...");
        let session = await loadSessionFromDb();
        if (session) {
          log.info("Sesión cargada desde DB — omitiendo Playwright");
        } else {
          log.info("Sin sesión en DB — intentando login Playwright...");
          try {
            const { loginToInmovilla } = await import("@/lib/inmovilla/auth/login");
            session = await loginToInmovilla({ headless: true });
            await saveSessionToDb(session, "demands-login").catch(() => {});
          } catch (loginErr) {
            const classified = classifyError(loginErr);
            if (classified.code === "PLAYWRIGHT_MISSING_BROWSER") {
              alertGeneric(
                "Ingesta demandas: runtime sin Chromium de Playwright y sesión DB ausente/expirada",
                "critical",
                {
                  errorCode: classified.code,
                  recommendation:
                    "Renovar sesión en inmovilla_session_store desde el Session Proxy (Railway) y verificar su cron de refresh",
                },
              ).catch(() => {});
              throw classified;
            }
            if (classified.code === "COMPOSIO_GMAIL_NOT_CONNECTED") {
              alertGeneric(
                "Ingesta demandas: conexión Gmail en Composio caída o no autorizada",
                "critical",
                {
                  errorCode: classified.code,
                  recommendation:
                    "Reautorizar Gmail en https://app.composio.dev y validar COMPOSIO_GMAIL_CONNECTED_ACCOUNT_ID",
                },
              ).catch(() => {});
              throw classified;
            }
            log.warn("Login fallido, reintentando en 10s", {
              errorCode: classified.code,
              error: classified.message,
            });
            await delay(LOGIN_RETRY_DELAY_MS);
            try {
              const { loginToInmovilla } = await import("@/lib/inmovilla/auth/login");
              session = await loginToInmovilla({ headless: true });
              await saveSessionToDb(session, "demands-login-retry").catch(() => {});
            } catch (retryErr) {
              alertGeneric(
                "Ingesta demandas: login fallido tras 2 intentos y sin sesión en DB",
                "critical",
                {
                  error: retryErr instanceof Error ? retryErr.message : String(retryErr),
                },
              ).catch(() => {});
              throw retryErr;
            }
          }
        }

        // ── Fase 1b: lectura de demandas con retry ──────────────────────────
        log.info("Leyendo demandas...");
        let demands;
        try {
          demands = await fetchAllDemands(session);
        } catch (fetchErr) {
          if (isRetryableError(fetchErr)) {
            const classified = classifyError(fetchErr);
            log.warn("Fetch demandas fallido, reintentando en 5s", {
              errorCode: classified.code,
              error: classified.message,
            });
            await delay(FETCH_RETRY_DELAY_MS);
            demands = await fetchAllDemands(session);
          } else {
            throw fetchErr;
          }
        }
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
          removed: diff.removed.length,
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
            removed: diff.removed.length,
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
          diff: { created: 0, modified: 0, statusChanged: 0, removed: 0, unchanged: 0 },
          error: classified.message,
          errorCode: classified.code,
          retryable: classified.retryable,
        };
      }
    },
  );
}
