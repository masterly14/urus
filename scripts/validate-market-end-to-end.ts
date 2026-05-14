/**
 * Validación end-to-end del pipeline Market en local.
 *
 * Flujo:
 *  1. runCrawlTick varias veces hasta que no haya seeds elegibles. Cada tick
 *     encola MARKET_CRAWL_SEED y los procesa llamando al worker (HTTP).
 *  2. Espera a que los crawls hayan persistido sus MarketRawListing.
 *  3. Encola MARKET_NORMALIZE_BATCH para cada source con raws CAPTURED.
 *  4. Drena la cola con runConsumerLoop (que encadena
 *     normalize → resolve_identity → diff_and_version → refresh_snapshot).
 *  5. Imprime un resumen de raw / listing / property / jobs.
 *
 * Pre-requisitos:
 *  - .env del root cargado (BRIGHTDATA_*, MARKET_WORKER_*, DATABASE_URL, ...)
 *  - Market Worker corriendo en MARKET_WORKER_BASE_URL.
 *  - Seeds creados (seed-market-cordoba.ts + seed-market-idealista-cordoba.ts).
 *
 * Uso:
 *   npx tsx scripts/validate-market-end-to-end.ts
 *   npx tsx scripts/validate-market-end-to-end.ts --skip-detail
 */

import "dotenv/config";
import { randomUUID } from "node:crypto";
import type { MarketSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { enqueueJob } from "@/lib/job-queue";
import { discoverDueSeeds, runCrawlTick } from "@/lib/market/scheduler";
import { runConsumerLoop } from "@/lib/workers/consumer";
import type { JobType } from "@/types/domain";

const SOURCES_TO_NORMALIZE: MarketSource[] = ["source_a", "source_b", "source_d"];
const CRAWL_ROUNDS = Number(process.env.E2E_CRAWL_ROUNDS ?? 6);
const CRAWL_BATCH = Number(process.env.E2E_CRAWL_BATCH ?? 10);
const CRAWL_GAP_MS = Number(process.env.E2E_CRAWL_GAP_MS ?? 1500);
const NORMALIZE_BATCH = Number(process.env.E2E_NORMALIZE_BATCH ?? 200);
const CONSUMER_MAX_CYCLES = Number(process.env.E2E_CONSUMER_MAX_CYCLES ?? 1200);
const POST_CRAWL_WAIT_MS = Number(process.env.E2E_POST_CRAWL_WAIT_MS ?? 4000);
const SKIP_DETAIL = process.argv.includes("--skip-detail");

const NORMALIZE_CHAIN: JobType[] = [
  "MARKET_NORMALIZE_BATCH",
  "MARKET_RESOLVE_IDENTITY",
  "MARKET_RESOLVE_ADVERTISER",
  "MARKET_DIFF_AND_VERSION",
  "MARKET_REFRESH_SNAPSHOT",
];

const DETAIL_CHAIN: JobType[] = ["MARKET_FETCH_DETAIL", "MARKET_RESOLVE_ADVERTISER"];

function checkEnv(): void {
  const required = ["DATABASE_URL", "MARKET_WORKER_BASE_URL", "MARKET_WORKER_SHARED_SECRET"];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Faltan env vars: ${missing.join(", ")}`);
  }
}

async function activeSeedsCount(): Promise<Record<string, number>> {
  const rows = await prisma.marketSeed.groupBy({
    by: ["source"],
    where: { active: true },
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((r) => [r.source, r._count._all]));
}

async function runCrawlPhase(): Promise<void> {
  console.log("\n=== FASE 1: CRAWL ===");
  const seedsBy = await activeSeedsCount();
  console.log(`[crawl] seeds activas:`, seedsBy);

  // 1.a) discoverDueSeeds: encola MARKET_CRAWL_SEED por cada seed elegible
  //      (respeta cadencia y circuit breakers).
  const discovered = await discoverDueSeeds({ limit: 25 });
  console.log(
    `[crawl] discovered scanned=${discovered.scanned} enqueued=${discovered.enqueued} skippedBlocked=${discovered.skippedBlocked} skippedAlreadyEnqueued=${discovered.skippedAlreadyEnqueued}`,
  );

  // 1.b) runCrawlTick rounds: por cada round, dequeuea hasta CRAWL_BATCH jobs y
  //      los ejecuta llamando al Worker via HTTP.
  for (let round = 1; round <= CRAWL_ROUNDS; round++) {
    const workerId = `e2e-crawl-${round}-${randomUUID().slice(0, 6)}`;
    const result = await runCrawlTick({ workerId, batchSize: CRAWL_BATCH });
    console.log(
      `[crawl] round=${round} processed=${result.processed} accepted=${result.accepted} blocked=${result.blocked} failed=${result.failed} noWork=${result.noWork}`,
    );
    if (result.noWork) break;
    await sleep(CRAWL_GAP_MS);
  }

  console.log(`[crawl] esperando ${POST_CRAWL_WAIT_MS}ms para que se persistan raws en background...`);
  await sleep(POST_CRAWL_WAIT_MS);
}

async function rawSummary(): Promise<Record<string, Record<string, number>>> {
  const rows = await prisma.marketRawListing.groupBy({
    by: ["source", "status"],
    _count: { _all: true },
  });
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    out[r.source] ??= {};
    out[r.source][r.status] = r._count._all;
  }
  return out;
}

async function enqueueNormalizeForCapturedSources(): Promise<MarketSource[]> {
  const summary = await rawSummary();
  console.log("\n=== FASE 2: ENCOLAR NORMALIZE ===");
  console.log("[normalize] raws por source:", summary);
  const enqueuedFor: MarketSource[] = [];
  const minuteBucket = Math.floor(Date.now() / 60_000);

  for (const source of SOURCES_TO_NORMALIZE) {
    const captured = summary[source]?.CAPTURED ?? 0;
    if (captured === 0) {
      console.log(`[normalize] ${source}: 0 raws CAPTURED, skip`);
      continue;
    }
    const idempotencyKey = `e2e:market-normalize-batch:${source}:${minuteBucket}`;
    await enqueueJob({
      type: "MARKET_NORMALIZE_BATCH",
      payload: { batchSize: NORMALIZE_BATCH, source },
      idempotencyKey,
      priority: 300,
    });
    console.log(`[normalize] ${source}: enqueued (captured=${captured}) key=${idempotencyKey}`);
    enqueuedFor.push(source);
  }
  return enqueuedFor;
}

async function drainConsumer(label: string, types: JobType[]): Promise<void> {
  const workerId = `e2e-${label}-${randomUUID().slice(0, 6)}`;
  console.log(`\n[consumer:${label}] arrancando workerId=${workerId} types=${types.join(",")}`);
  const res = await runConsumerLoop({
    workerId,
    maxCycles: CONSUMER_MAX_CYCLES,
    batchSize: CONSUMER_MAX_CYCLES,
    pollIntervalMs: 1000,
    types,
  });
  console.log(
    `[consumer:${label}] cycles=${res.cycles} processed=${res.totalProcessed} failed=${res.totalFailed}`,
  );
}

async function printFinalSummary(): Promise<void> {
  console.log("\n=== RESUMEN FINAL ===");

  const [raws, listings, propertyCount, jobs, listingsBySource, perAdvertiser, eventsByType] =
    await Promise.all([
      prisma.marketRawListing.groupBy({
        by: ["source", "status"],
        _count: { _all: true },
        orderBy: [{ source: "asc" }, { status: "asc" }],
      }),
      prisma.marketListing.groupBy({
        by: ["source", "status"],
        _count: { _all: true },
        orderBy: [{ source: "asc" }, { status: "asc" }],
      }),
      prisma.marketProperty.count(),
      prisma.jobQueue.groupBy({
        by: ["type", "status"],
        _count: { _all: true },
        where: { type: { in: [...NORMALIZE_CHAIN, "MARKET_CRAWL_SEED", "MARKET_FETCH_DETAIL"] } },
        orderBy: [{ type: "asc" }, { status: "asc" }],
      }),
      prisma.marketListing.count(),
      prisma.marketListing.groupBy({
        by: ["source"],
        _count: { _all: true },
      }),
      prisma.marketEvent.groupBy({
        by: ["type"],
        _count: { _all: true },
      }),
    ]);

  console.log("\nMarketRawListing:");
  console.table(raws.map((r) => ({ source: r.source, status: r.status, count: r._count._all })));

  console.log("\nMarketListing por source/status:");
  console.table(listings.map((r) => ({ source: r.source, status: r.status, count: r._count._all })));

  console.log("\nMarketListing total:", listingsBySource);
  console.log("MarketProperty count:", propertyCount);

  console.log("\nMarketEvent por type:");
  console.table(eventsByType.map((e) => ({ type: e.type, count: e._count._all })));

  console.log("\nJobQueue (Market):");
  console.table(jobs.map((j) => ({ type: j.type, status: j.status, count: j._count._all })));

  console.log(`\nMarketListing detallado por source:`);
  console.table(perAdvertiser.map((r) => ({ source: r.source, count: r._count._all })));
}

async function failedJobsTopErrors(): Promise<void> {
  const failed = await prisma.jobQueue.findMany({
    where: { status: "FAILED", type: { in: [...NORMALIZE_CHAIN, "MARKET_CRAWL_SEED", "MARKET_FETCH_DETAIL"] } },
    orderBy: { failedAt: "desc" },
    take: 5,
    select: { id: true, type: true, lastError: true, attempts: true },
  });
  if (failed.length === 0) return;
  console.log("\n[errors] últimos jobs fallidos:");
  for (const j of failed) {
    console.log(`  - ${j.type} attempts=${j.attempts}`);
    console.log(`    ${(j.lastError ?? "").slice(0, 220)}`);
  }
}

async function main(): Promise<void> {
  checkEnv();
  console.log("[e2e] inicio", {
    crawlRounds: CRAWL_ROUNDS,
    crawlBatch: CRAWL_BATCH,
    normalizeBatch: NORMALIZE_BATCH,
    skipDetail: SKIP_DETAIL,
    workerBaseUrl: process.env.MARKET_WORKER_BASE_URL,
  });

  await runCrawlPhase();
  const enqueuedSources = await enqueueNormalizeForCapturedSources();

  if (enqueuedSources.length > 0) {
    await drainConsumer("normalize-chain", NORMALIZE_CHAIN);
  } else {
    console.log("[e2e] ninguna source con raws CAPTURED, salto normalize");
  }

  if (!SKIP_DETAIL) {
    await drainConsumer("detail", DETAIL_CHAIN);
  }

  await printFinalSummary();
  await failedJobsTopErrors();
  console.log("\n[e2e] fin");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main()
  .catch((err) => {
    console.error("[e2e] fatal:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
