import "dotenv/config";
import { runDemandsIngestionCycle } from "../lib/workers/ingestion/demands/demands-worker";

async function main() {
  console.log("[run-ingestion] Ejecutando ciclo de ingesta de demandas...\n");

  const result = await runDemandsIngestionCycle();

  console.log("\n=== Resultado del ciclo ===");
  console.log(`  Ciclo ID       : ${result.cycleId}`);
  console.log(`  Duración       : ${result.durationMs}ms`);
  console.log(`  Leídas         : ${result.demandsRead}`);
  console.log(`  Nuevas         : ${result.diff.created}`);
  console.log(`  Modificadas    : ${result.diff.modified}`);
  console.log(`  Cambio estado  : ${result.diff.statusChanged}`);
  console.log(`  Sin cambios    : ${result.diff.unchanged}`);
  console.log(`  Eventos        : ${result.eventsEmitted}`);
  if (result.error) {
    console.error(`  Error          : ${result.error}`);
    process.exit(1);
  }
  console.log("===========================\n");
}

main().catch((err) => {
  console.error("[run-ingestion-demands] Error fatal:", err.message ?? err);
  process.exit(1);
});
