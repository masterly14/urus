/**
 * Drena la cola `job_queue` SOLO para el tipo `MARKET_FETCH_DETAIL`.
 *
 * Uso puntual: ejecutar localmente cuando los jobs MARKET_FETCH_DETAIL estan
 * acumulados PENDING porque el consumer Railway aun no ha sido redeployado
 * con el fix que lo habilita a procesar `MARKET_*` (ver el commit que
 * actualizo `lib/workers/consumer/types.ts` quitando el filtro
 * `RAILWAY_EXCLUDED_PREFIXES = ["MARKET_"]`).
 *
 * Una vez el Railway consumer este redeployado, este script se vuelve
 * innecesario (el consumer 24/7 los drena automaticamente). Lo dejamos
 * como herramienta de emergencia.
 *
 * Seguridad:
 *  - Filtra por `types: ["MARKET_FETCH_DETAIL"]` ⇒ no toca otros jobs en
 *    la cola (sigue siendo seguro convivir con el consumer Railway
 *    porque la cola usa FOR UPDATE SKIP LOCKED).
 *  - `workerId` propio (`local-drain-<uuid>`) ⇒ trazable en logs.
 *  - Requiere MARKET_WORKER_BASE_URL y MARKET_WORKER_SHARED_SECRET en el
 *    shell local (suelen estar en .env). Si faltan, el handler hace
 *    early-return success sin trabajo (skip silencioso); el script lo
 *    detecta y avisa antes de empezar.
 *
 * Uso:
 *   npx tsx scripts/drain-market-fetch-detail.ts                    # drena hasta vaciar
 *   npx tsx scripts/drain-market-fetch-detail.ts --max-cycles 20    # tope para pruebas
 *   npx tsx scripts/drain-market-fetch-detail.ts --batch-size 5     # menos concurrencia
 */
import "dotenv/config";
import { randomUUID } from "crypto";
import { runConsumerLoop } from "@/lib/workers/consumer";

interface CliOptions {
  maxCycles: number;
  batchSize: number;
  pollIntervalMs: number;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    maxCycles: 600,
    batchSize: 10,
    pollIntervalMs: 1000,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if ((a === "--max-cycles" || a === "-m") && next) {
      opts.maxCycles = Math.max(1, Number(next));
      i++;
    } else if ((a === "--batch-size" || a === "-b") && next) {
      opts.batchSize = Math.max(1, Number(next));
      i++;
    } else if (a === "--poll-interval-ms" && next) {
      opts.pollIntervalMs = Math.max(100, Number(next));
      i++;
    } else if (a === "--help" || a === "-h") {
      console.log(
        [
          "Uso: npx tsx scripts/drain-market-fetch-detail.ts [opciones]",
          "  --max-cycles N         Max iteraciones del loop (default 600).",
          "  --batch-size N         Tamano de lote por ciclo (default 10).",
          "  --poll-interval-ms N   Pausa entre dequeues vacios (default 1000).",
        ].join("\n"),
      );
      process.exit(0);
    } else {
      throw new Error(`Argumento no reconocido: ${a}`);
    }
  }
  return opts;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const baseUrl = process.env.MARKET_WORKER_BASE_URL?.trim();
  const secret = process.env.MARKET_WORKER_SHARED_SECRET?.trim();

  console.log("=".repeat(80));
  console.log("DRAIN MARKET_FETCH_DETAIL (uso puntual)");
  console.log("=".repeat(80));
  console.log(
    [
      `  workerBaseUrl    : ${baseUrl ?? "(NO definida)"}`,
      `  workerSecret     : ${secret ? "(definida)" : "(NO definida)"}`,
      `  maxCycles        : ${opts.maxCycles}`,
      `  batchSize        : ${opts.batchSize}`,
      `  pollIntervalMs   : ${opts.pollIntervalMs}`,
    ].join("\n"),
  );

  if (!baseUrl || !secret) {
    console.error(
      "\n[drain] ERROR: MARKET_WORKER_BASE_URL/SHARED_SECRET no estan definidas.",
    );
    console.error(
      "[drain] Sin ellas el handler hace early-return success sin trabajo (skip).",
    );
    console.error("[drain] Configura tu .env antes de drenar. Abortando.");
    process.exit(2);
  }
  console.log("");

  const workerId = `local-drain-${randomUUID().slice(0, 8)}`;
  const t0 = Date.now();
  const result = await runConsumerLoop({
    workerId,
    maxCycles: opts.maxCycles,
    batchSize: opts.batchSize,
    pollIntervalMs: opts.pollIntervalMs,
    types: ["MARKET_FETCH_DETAIL"],
  });
  const tMs = Date.now() - t0;

  console.log("\n=".repeat(40));
  console.log("RESUMEN");
  console.log("=".repeat(80));
  console.log(`  workerId       : ${workerId}`);
  console.log(`  ciclos         : ${result.cycles}`);
  console.log(`  procesados     : ${result.totalProcessed}`);
  console.log(`  fallidos       : ${result.totalFailed}`);
  console.log(`  duracion       : ${Math.round(tMs / 1000)}s`);
  console.log("");
  console.log(
    "Audita resultado con: npx tsx scripts/diagnose-market-phone-enrichment.ts",
  );
}

main().catch((err) => {
  console.error("[drain-market-fetch-detail] fatal:", err);
  process.exit(1);
});
