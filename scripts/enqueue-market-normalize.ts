/**
 * Encola un job MARKET_NORMALIZE_BATCH para una source concreta del Mercado.
 *
 * Esto es el equivalente local de lo que el cron QStash
 * `/api/cron/market/discover-seeds` haría en producción tras un crawl: tomar
 * los `MarketRawListing` con `status=CAPTURED` y normalizarlos a
 * `MarketListing`.
 *
 * Uso:
 *   npx tsx scripts/enqueue-market-normalize.ts                       # default: source_b
 *   npx tsx scripts/enqueue-market-normalize.ts --source source_a
 *   npx tsx scripts/enqueue-market-normalize.ts --source source_d --batch 100
 *
 * Tras encolar, drena la cola con:
 *   npx tsx scripts/run-consumer.ts
 *
 * El handler MARKET_NORMALIZE_BATCH encadena por sí mismo:
 *   normalize → MARKET_RESOLVE_IDENTITY → MARKET_DIFF_AND_VERSION
 */
import "dotenv/config";
import { enqueueJob } from "@/lib/job-queue";
import type { MarketSource } from "@/lib/market/types";

const VALID_SOURCES: MarketSource[] = [
  "source_a",
  "source_b",
  "source_c",
  "source_d",
];

interface CliOptions {
  source: MarketSource;
  batchSize: number;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { source: "source_b", batchSize: 200 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if ((a === "--source" || a === "-s") && next) {
      if (!VALID_SOURCES.includes(next as MarketSource)) {
        throw new Error(
          `--source debe ser uno de: ${VALID_SOURCES.join(", ")} (recibido: ${next})`,
        );
      }
      opts.source = next as MarketSource;
      i++;
    } else if ((a === "--batch" || a === "-b") && next) {
      const n = Number(next);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`--batch debe ser un entero positivo (recibido: ${next})`);
      }
      opts.batchSize = Math.floor(n);
      i++;
    } else if (a === "--help" || a === "-h") {
      console.log(
        "Uso: npx tsx scripts/enqueue-market-normalize.ts [--source <source_a|source_b|source_c|source_d>] [--batch <N>]",
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
  const minuteBucket = Math.floor(Date.now() / 60_000);
  const idempotencyKey = `market:normalize-batch:${opts.source}:${minuteBucket}`;
  const job = await enqueueJob({
    type: "MARKET_NORMALIZE_BATCH",
    payload: { batchSize: opts.batchSize, source: opts.source },
    idempotencyKey,
    priority: 300,
  });
  console.log(
    "[enqueue-market-normalize]",
    JSON.stringify(
      {
        jobId: job.id,
        status: job.status,
        type: job.type,
        source: opts.source,
        batchSize: opts.batchSize,
        idempotencyKey,
      },
      null,
      2,
    ),
  );
  console.log(
    "[enqueue-market-normalize] OK. Drena la cola con: npx tsx scripts/run-consumer.ts",
  );
}

main().catch((err) => {
  console.error("[enqueue-market-normalize] fatal:", err);
  process.exit(1);
});
