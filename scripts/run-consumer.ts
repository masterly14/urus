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
    types: [
      "PROCESS_EVENT",
      "NOTIFY_LEAD_WHATSAPP",
      "FOLLOW_UP_LEAD",
      "GENERATE_MICROSITE",
      "NOTIFY_MICROSITE_PENDING_VALIDATION",
      "SEND_MICROSITE_TO_BUYER",
      "WRITE_TO_INMOVILLA",
      "GENERATE_CONTRACT_DRAFT",
      "NOTIFY_CONTRACT_DATA_INCOMPLETE",
      "SEND_SIGNATURE_REQUEST",
      "RUN_PRICING_ANALYSIS",
      "NOTIFY_PRICING_WHATSAPP",
      "SEND_POST_SALE_MESSAGE",
      "SEND_REVIEW_REQUEST",
      "SEND_REVIEW_REMINDER",
      "SEND_REFERRAL_REQUEST",
      "START_POSTVENTA_CADENCE",
      "SEND_POSTVENTA_MESSAGE",
    ],
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
