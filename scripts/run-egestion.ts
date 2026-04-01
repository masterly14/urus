import "dotenv/config";
import { randomUUID } from "crypto";
import { runConsumerLoop } from "../lib/workers/consumer";

const DEFAULT_MAX_CYCLES = 20;

async function main() {
  const maxCycles = Number(process.env.EGESTION_MAX_CYCLES) || DEFAULT_MAX_CYCLES;
  const workerId = `cli-egestion-${randomUUID().slice(0, 8)}`;

  console.log(
    `[run-egestion] Iniciando egestion workerId=${workerId} maxCycles=${maxCycles}\n`,
  );

  const result = await runConsumerLoop({
    workerId,
    maxCycles,
    batchSize: maxCycles,
    pollIntervalMs: 1_000,
    types: ["WRITE_TO_INMOVILLA"],
  });

  console.log("\n=== Resultado del egestion ===");
  console.log(`  Ciclos         : ${result.cycles}`);
  console.log(`  Procesados     : ${result.totalProcessed}`);
  console.log(`  Fallidos       : ${result.totalFailed}`);
  console.log("==============================\n");
}

main().catch((err) => {
  console.error("[run-egestion] Error fatal:", err.message ?? err);
  process.exit(1);
});

