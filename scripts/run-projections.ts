import "dotenv/config";
import { randomUUID } from "crypto";
import { runProjectionLoop } from "../lib/projections";

const DEFAULT_MAX_CYCLES = 100;

async function main() {
  const maxCycles = Number(process.env.PROJECTIONS_MAX_CYCLES) || DEFAULT_MAX_CYCLES;
  const workerId = `cli-projections-${randomUUID().slice(0, 8)}`;

  console.log(`[run-projections] Iniciando worker workerId=${workerId} maxCycles=${maxCycles}\n`);

  const result = await runProjectionLoop({
    workerId,
    maxCycles,
    batchSize: maxCycles,
    pollIntervalMs: 500,
  });

  console.log("\n=== Resultado de proyecciones ===");
  console.log(`  Ciclos         : ${result.cycles}`);
  console.log(`  Procesados     : ${result.totalProcessed}`);
  console.log(`  Fallidos       : ${result.totalFailed}`);
  console.log("=================================\n");
}

main().catch((err) => {
  console.error("[run-projections] Error fatal:", err.message ?? err);
  process.exit(1);
});
