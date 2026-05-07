import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { enqueueJob } from "@/lib/job-queue";
import { runCrawlTick } from "@/lib/market/scheduler";
import { runConsumerLoop } from "@/lib/workers/consumer";
import type { JobType } from "@/types/domain";

const CITY = process.env.MARKET_SYNC_CITY?.trim() || "cordoba";
const CRAWL_TICK_ROUNDS = Number(process.env.MARKET_SYNC_CRAWL_TICK_ROUNDS ?? 8);
const CRAWL_TICK_BATCH_SIZE = Number(process.env.MARKET_SYNC_CRAWL_TICK_BATCH_SIZE ?? 10);
const NORMALIZE_ROUNDS = Number(process.env.MARKET_SYNC_NORMALIZE_ROUNDS ?? 10);
const NORMALIZE_BATCH_SIZE = Number(process.env.MARKET_SYNC_NORMALIZE_BATCH_SIZE ?? 200);
const CONSUMER_MAX_CYCLES = Number(process.env.MARKET_SYNC_CONSUMER_MAX_CYCLES ?? 1200);
const INCLUDE_DETAIL =
  String(process.env.MARKET_SYNC_INCLUDE_DETAIL ?? "true").toLowerCase() !== "false";
const DETAIL_MAX_CYCLES = Number(process.env.MARKET_SYNC_DETAIL_MAX_CYCLES ?? 2400);

const MARKET_SYNC_JOB_TYPES: JobType[] = [
  "MARKET_NORMALIZE_BATCH",
  "MARKET_RESOLVE_IDENTITY",
  "MARKET_RESOLVE_ADVERTISER",
  "MARKET_DIFF_AND_VERSION",
  "MARKET_REFRESH_SNAPSHOT",
  "MARKET_PUSH_ADVERTISER_TO_INMOVILLA",
];

async function main(): Promise<void> {
  console.log("[market-sync-local] Inicio");
  console.log(
    `[market-sync-local] city=${CITY} crawlRounds=${CRAWL_TICK_ROUNDS} normalizeRounds=${NORMALIZE_ROUNDS} includeDetail=${INCLUDE_DETAIL}`,
  );

  await assertPrerequisites();
  const seeds = await activateAndLoadIdealistaSeeds(CITY);
  await enqueueCrawlJobs(seeds);

  for (let round = 1; round <= CRAWL_TICK_ROUNDS; round++) {
    const res = await runCrawlTick({
      workerId: `market-sync-crawl-${randomUUID().slice(0, 8)}`,
      batchSize: CRAWL_TICK_BATCH_SIZE,
    });
    console.log(
      `[market-sync-local] crawl-tick round=${round} processed=${res.processed} accepted=${res.accepted} blocked=${res.blocked} failed=${res.failed} noWork=${res.noWork}`,
    );
    if (res.noWork) break;
    await sleep(1200);
  }

  // Dar ventana a accepted/background para persistir raws.
  await sleep(4000);

  for (let round = 1; round <= NORMALIZE_ROUNDS; round++) {
    const capturedPending = await prisma.marketRawListing.count({
      where: { source: "source_d", status: "CAPTURED" },
    });
    if (capturedPending === 0) {
      console.log("[market-sync-local] No hay raws CAPTURED pendientes para source_d");
      break;
    }

    const minuteBucket = Math.floor(Date.now() / 60_000);
    const idempotencyKey = `market:normalize-batch:source_d:${minuteBucket}:${round}`;
    await enqueueJob({
      type: "MARKET_NORMALIZE_BATCH",
      payload: { batchSize: NORMALIZE_BATCH_SIZE, source: "source_d" },
      idempotencyKey,
      priority: 300,
    });
    console.log(
      `[market-sync-local] normalize round=${round} enqueued key=${idempotencyKey} capturedPending=${capturedPending}`,
    );

    const consumerResult = await runConsumerLoop({
      workerId: `market-sync-consumer-${randomUUID().slice(0, 8)}`,
      maxCycles: CONSUMER_MAX_CYCLES,
      batchSize: CONSUMER_MAX_CYCLES,
      pollIntervalMs: 1000,
      types: MARKET_SYNC_JOB_TYPES,
    });
    console.log(
      `[market-sync-local] consumer round=${round} cycles=${consumerResult.cycles} processed=${consumerResult.totalProcessed} failed=${consumerResult.totalFailed}`,
    );
  }

  if (INCLUDE_DETAIL) {
    await drainDetailJobs();
  } else {
    console.log(
      "[market-sync-local] detalle desactivado (MARKET_SYNC_INCLUDE_DETAIL=false)",
    );
  }

  await printSummary();
  console.log("[market-sync-local] Fin");
}

async function assertPrerequisites(): Promise<void> {
  const missing: string[] = [];
  if (!process.env.MARKET_WORKER_BASE_URL) missing.push("MARKET_WORKER_BASE_URL");
  if (!process.env.MARKET_WORKER_SHARED_SECRET) missing.push("MARKET_WORKER_SHARED_SECRET");
  if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");
  if (missing.length > 0) {
    throw new Error(`Faltan variables obligatorias: ${missing.join(", ")}`);
  }
}

async function activateAndLoadIdealistaSeeds(city: string) {
  const seeds = await prisma.marketSeed.findMany({
    where: { source: "source_d", city },
    orderBy: { createdAt: "asc" },
  });
  if (seeds.length === 0) {
    throw new Error(
      `No hay seeds source_d para city=${city}. Ejecuta primero scripts/seed-market-idealista-cordoba.ts`,
    );
  }
  await prisma.marketSeed.updateMany({
    where: { id: { in: seeds.map((s) => s.id) }, active: false },
    data: { active: true },
  });
  console.log(`[market-sync-local] seeds source_d city=${city}: ${seeds.length}`);
  return seeds;
}

async function enqueueCrawlJobs(
  seeds: Array<{
    id: string;
    source: "source_d";
    operation: "sale" | "rent";
    url: string;
    lastCursor: string | null;
    priority: number;
  }>,
): Promise<void> {
  const minuteBucket = Math.floor(Date.now() / 60_000);
  let enqueued = 0;
  let duplicates = 0;

  for (const seed of seeds) {
    const correlationId = randomUUID();
    const run = await prisma.marketCrawlRun.create({
      data: {
        seedId: seed.id,
        source: seed.source,
        status: "RUNNING",
        budgetMs: 60_000,
        budgetRequests: 50,
        cursorIn: seed.lastCursor,
        correlationId,
      },
    });

    const idempotencyKey = `market:crawl:sync:${seed.id}:${minuteBucket}`;
    try {
      await enqueueJob({
        type: "MARKET_CRAWL_SEED",
        payload: {
          runId: run.id,
          seedId: seed.id,
          source: seed.source,
          operation: seed.operation,
          url: seed.url,
          cursor: seed.lastCursor,
          budgetMs: 60_000,
          budgetRequests: 50,
          traceId: correlationId,
        },
        idempotencyKey,
        priority: Math.max(seed.priority, 200),
      });
      enqueued++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/Unique constraint|P2002/i.test(message)) {
        duplicates++;
        await prisma.marketCrawlRun.delete({ where: { id: run.id } }).catch(() => undefined);
      } else {
        await prisma.marketCrawlRun
          .update({
            where: { id: run.id },
            data: {
              status: "FAILED",
              errorCode: "ENQUEUE_ERROR",
              errorMessage: message.slice(0, 2000),
              finishedAt: new Date(),
            },
          })
          .catch(() => undefined);
        throw err;
      }
    }
  }

  console.log(
    `[market-sync-local] MARKET_CRAWL_SEED enqueued=${enqueued} duplicates=${duplicates}`,
  );
}

async function printSummary(): Promise<void> {
  const [raw, listing, runs, pendingJobs] = await Promise.all([
    prisma.marketRawListing.groupBy({
      by: ["source", "status"],
      _count: { _all: true },
      where: { source: "source_d" },
      orderBy: [{ source: "asc" }, { status: "asc" }],
    }),
    prisma.marketListing.groupBy({
      by: ["source", "status"],
      _count: { _all: true },
      where: { source: "source_d" },
      orderBy: [{ source: "asc" }, { status: "asc" }],
    }),
    prisma.marketCrawlRun.findMany({
      where: { source: "source_d" },
      orderBy: { startedAt: "desc" },
      take: 5,
      select: {
        id: true,
        status: true,
        pagesScanned: true,
        itemsCaptured: true,
        blockedCount: true,
        errorCode: true,
        startedAt: true,
      },
    }),
    prisma.jobQueue.groupBy({
      by: ["type", "status"],
      _count: { _all: true },
      where: {
        type: {
          in: [
            "MARKET_CRAWL_SEED",
            "MARKET_NORMALIZE_BATCH",
            "MARKET_FETCH_DETAIL",
            "MARKET_RESOLVE_IDENTITY",
            "MARKET_RESOLVE_ADVERTISER",
            "MARKET_DIFF_AND_VERSION",
          ],
        },
      },
      orderBy: [{ type: "asc" }, { status: "asc" }],
    }),
  ]);

  console.log("\n[market-sync-local] SUMMARY raw(source_d):");
  console.log(JSON.stringify(raw, null, 2));
  console.log("\n[market-sync-local] SUMMARY listing(source_d):");
  console.log(JSON.stringify(listing, null, 2));
  console.log("\n[market-sync-local] SUMMARY runs(source_d latest 5):");
  console.log(JSON.stringify(runs, null, 2));
  console.log("\n[market-sync-local] SUMMARY jobs:");
  console.log(JSON.stringify(pendingJobs, null, 2));
}

async function drainDetailJobs(): Promise<void> {
  console.log("[market-sync-local] iniciando drenado de MARKET_FETCH_DETAIL...");
  const consumerResult = await runConsumerLoop({
    workerId: `market-sync-detail-${randomUUID().slice(0, 8)}`,
    maxCycles: DETAIL_MAX_CYCLES,
    batchSize: DETAIL_MAX_CYCLES,
    pollIntervalMs: 1000,
    types: ["MARKET_FETCH_DETAIL", "MARKET_RESOLVE_ADVERTISER"],
  });
  console.log(
    `[market-sync-local] detail-consumer cycles=${consumerResult.cycles} processed=${consumerResult.totalProcessed} failed=${consumerResult.totalFailed}`,
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

main()
  .catch((err) => {
    console.error("[market-sync-local] fatal:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
