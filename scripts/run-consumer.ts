import "dotenv/config";
import { randomUUID } from "crypto";
import { runConsumerLoop } from "../lib/workers/consumer";

const DEFAULT_MAX_CYCLES = 50;

async function main() {
  const maxCycles = Number(process.env.CONSUMER_MAX_CYCLES) || DEFAULT_MAX_CYCLES;
  const workerId = `cli-consumer-${randomUUID().slice(0, 8)}`;

  console.log(`[run-consumer] Iniciando consumer workerId=${workerId} maxCycles=${maxCycles}\n`);

  const result = await runConsumerLoop({
    workerId,
    maxCycles,
    batchSize: maxCycles,
    pollIntervalMs: 1_000,
  });

  console.log("\n=== Resultado del consumer ===");
  console.log(`  Ciclos         : ${result.cycles}`);
  console.log(`  Procesados     : ${result.totalProcessed}`);
  console.log(`  Fallidos       : ${result.totalFailed}`);
  console.log("==============================\n");
}

main().catch((err) => {
  console.error("[run-consumer] Error fatal:", err.message ?? err);
  process.exit(1);
});
