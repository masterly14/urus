import { randomUUID } from "crypto";
import { loginToInmovilla } from "@/lib/inmovilla/auth/login";
import { fetchAllProperties } from "@/lib/inmovilla/api/properties";
import { loadPreviousSnapshot, saveCurrentSnapshot } from "./snapshot-repo";
import { computePropertyDiff } from "./properties-diff";
import { publishEventsForDiff } from "./event-publisher";
import type { IngestionCycleResult } from "./types";

export async function runPropertiesIngestionCycle(): Promise<IngestionCycleResult> {
  const cycleId = randomUUID();
  const startedAt = new Date();

  console.log(`[ingestion:properties] Ciclo ${cycleId} iniciado`);

  try {
    console.log("[ingestion:properties] Iniciando login...");
    const session = await loginToInmovilla({ headless: true });

    console.log("[ingestion:properties] Leyendo propiedades...");
    const properties = await fetchAllProperties(session);
    console.log(
      `[ingestion:properties] ${properties.length} propiedades leídas`,
    );

    console.log("[ingestion:properties] Cargando snapshot previo...");
    const previousSnapshot = await loadPreviousSnapshot();
    console.log(
      `[ingestion:properties] Snapshot previo: ${previousSnapshot.size} propiedades`,
    );

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
