/**
 * Purga jobs en estado DEAD_LETTER de la tabla job_queue.
 *
 * Por defecto hace dry-run (solo muestra conteos). Pasa --apply para borrar.
 *
 * Uso:
 *   npx tsx scripts/purge-dead-letter-jobs.ts
 *   npx tsx scripts/purge-dead-letter-jobs.ts --type MARKET_IMPORT_LISTING_IMAGES
 *   npx tsx scripts/purge-dead-letter-jobs.ts --type PROCESS_EVENT --apply
 *   npx tsx scripts/purge-dead-letter-jobs.ts --apply --older-than-days 7
 */
import "dotenv/config";
import { JobType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getDeadLetterStats,
  purgeAllDeadLetterJobs,
} from "@/lib/job-queue";

const JOB_TYPES = new Set<string>(Object.values(JobType));

type CliOptions = {
  apply: boolean;
  type?: JobType;
  olderThanDays: number;
  batchSize: number;
};

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    apply: false,
    olderThanDays: 0,
    batchSize: 500,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") {
      opts.apply = true;
      continue;
    }
    if (arg === "--type" && argv[i + 1]) {
      const type = argv[++i];
      if (!JOB_TYPES.has(type)) {
        throw new Error(`Tipo de job no válido: ${type}`);
      }
      opts.type = type as JobType;
      continue;
    }
    if (arg === "--older-than-days" && argv[i + 1]) {
      opts.olderThanDays = Math.max(0, Number(argv[++i]));
      continue;
    }
    if (arg === "--batch-size" && argv[i + 1]) {
      opts.batchSize = Math.max(1, Number(argv[++i]));
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Argumento desconocido: ${arg}`);
  }

  return opts;
}

function printHelp(): void {
  console.log(`Uso: npx tsx scripts/purge-dead-letter-jobs.ts [opciones]

Opciones:
  --apply                 Ejecuta el borrado (sin esto solo dry-run)
  --type <JobType>        Solo ese tipo (p. ej. MARKET_IMPORT_LISTING_IMAGES)
  --older-than-days <n>   Solo jobs con failedAt anterior a hace n días (0 = todos)
  --batch-size <n>        Tamaño de lote al borrar (default 500)
  -h, --help              Esta ayuda
`);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const olderThanMs = opts.olderThanDays * 24 * 60 * 60 * 1000;

  const statsBefore = await getDeadLetterStats();
  console.log("[purge-dl] Estado actual DEAD_LETTER:");
  console.log(`  total=${statsBefore.total}`);
  for (const [type, count] of Object.entries(statsBefore.byType).sort(
    (a, b) => b[1] - a[1],
  )) {
    if (opts.type && type !== opts.type) continue;
    console.log(`  ${type}: ${count}`);
  }

  const where = {
    status: "DEAD_LETTER" as const,
    ...(opts.type ? { type: opts.type } : {}),
    ...(olderThanMs > 0
      ? { failedAt: { lt: new Date(Date.now() - olderThanMs) } }
      : {}),
  };

  const toPurge = await prisma.jobQueue.count({ where });
  console.log(
    `[purge-dl] Candidatos a borrar: ${toPurge}` +
      (opts.type ? ` (type=${opts.type})` : "") +
      (olderThanMs > 0 ? ` (olderThanDays=${opts.olderThanDays})` : ""),
  );

  if (!opts.apply) {
    console.log("[purge-dl] Dry-run: añade --apply para eliminar.");
    return;
  }

  if (toPurge === 0) {
    console.log("[purge-dl] Nada que purgar.");
    return;
  }

  const purged = await purgeAllDeadLetterJobs({
    type: opts.type,
    olderThanMs,
    batchSize: opts.batchSize,
  });

  const statsAfter = await getDeadLetterStats();
  console.log(`[purge-dl] Eliminados=${purged}, restantes en DLQ=${statsAfter.total}`);
}

main()
  .catch((err) => {
    console.error("[purge-dl] Error:", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
