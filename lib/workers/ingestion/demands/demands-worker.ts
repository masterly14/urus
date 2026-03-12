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

export async function runDemandsIngestionCycle(): Promise<DemandIngestionCycleResult> {
  const cycleId = randomUUID();
  const startedAt = new Date();

  console.log(`[ingestion:demands] Ciclo ${cycleId} iniciado`);

  try {
    console.log("[ingestion:demands] Iniciando login...");
    const session = await loginToInmovilla({ headless: true });

    console.log("[ingestion:demands] Leyendo demandas...");
    const demands = await fetchAllDemands(session);
    console.log(`[ingestion:demands] ${demands.length} demandas leídas`);

    console.log("[ingestion:demands] Cargando snapshot previo...");
    const previousSnapshot = await loadPreviousDemandSnapshot();
    console.log(
      `[ingestion:demands] Snapshot previo: ${previousSnapshot.size} demandas`,
    );

    console.log("[ingestion:demands] Calculando diff...");
    const diff = computeDemandDiff(demands, previousSnapshot);
    console.log(
      `[ingestion:demands] Diff: ${diff.created.length} nuevas, ${diff.modified.length} modificadas, ${diff.statusChanged.length} cambios de estado, ${diff.unchanged} sin cambios`,
    );

    const publication = await publishDemandEventsForDiff(diff, cycleId);
    const eventsEmitted = publication.emitted;
    console.log(`[ingestion:demands] ${eventsEmitted} eventos emitidos`);

    console.log("[ingestion:demands] Guardando snapshot actual...");
    await saveCurrentDemandSnapshot(demands, startedAt);

    const finishedAt = new Date();
    const result: DemandIngestionCycleResult = {
      cycleId,
      startedAt,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      demandsRead: demands.length,
      eventsEmitted,
      diff: {
        created: diff.created.length,
        modified: diff.modified.length,
        statusChanged: diff.statusChanged.length,
        unchanged: diff.unchanged,
      },
    };

    console.log(
      `[ingestion:demands] Ciclo ${cycleId} completado en ${result.durationMs}ms`,
    );
    return result;
  } catch (err: unknown) {
    const finishedAt = new Date();
    const message = err instanceof Error ? err.message : String(err);

    console.error(`[ingestion:demands] Ciclo ${cycleId} falló: ${message}`);

    return {
      cycleId,
      startedAt,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      demandsRead: 0,
      eventsEmitted: 0,
      diff: { created: 0, modified: 0, statusChanged: 0, unchanged: 0 },
      error: message,
    };
  }
}
