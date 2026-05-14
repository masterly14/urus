/**
 * WIPE total de datos de mercado (oportunidades) — todos los portales.
 *
 * Borra:
 *  - JobQueue con type que empieza por MARKET_ (PENDING/IN_PROGRESS/FAILED
 *    /COMPLETED/DEAD_LETTER, en cualquier estado).
 *  - MarketEvent (event log dedicado del Core de mercado).
 *  - MarketListingVersion (snapshots de cambios).
 *  - MarketListing (listings canonicalizados).
 *  - MarketRawListing (capturas brutas).
 *  - MarketCrawlRun (ejecuciones de crawl).
 *  - MarketAdvertiser (publicantes deduplicados).
 *  - MarketProperty (clusters cross-portal).
 *  - MarketSnapshotIndex (proyecciones agregadas).
 *
 * NO borra:
 *  - MarketSeed (configuracion de busquedas — seguimos queriendo crawl).
 *  - MarketCircuitBreaker (estado de salud del scraping).
 *  - MarketReport (reportes).
 *  - _prisma_migrations.
 *  - JobQueue de tipos no MARKET_*.
 *  - Event Store principal (Event).
 *
 * Uso:
 *  - Dry run (default):  npx tsx scripts/wipe-market-data.ts
 *  - Aplicar:            $env:MARKET_WIPE_CONFIRM="WIPE"; npx tsx scripts/wipe-market-data.ts
 *
 * El env `MARKET_WIPE_CONFIRM` debe valer literalmente "WIPE" para evitar
 * borrados accidentales.
 */
import "dotenv/config";
import { PrismaClient, type JobType } from "@prisma/client";

const CONFIRM = process.env.MARKET_WIPE_CONFIRM === "WIPE";

const MARKET_JOB_TYPES: JobType[] = [
  "MARKET_DISCOVER_SEEDS",
  "MARKET_CRAWL_SEED",
  "MARKET_FETCH_DETAIL",
  "MARKET_NORMALIZE_BATCH",
  "MARKET_RESOLVE_IDENTITY",
  "MARKET_RESOLVE_ADVERTISER",
  "MARKET_DIFF_AND_VERSION",
  "MARKET_REFRESH_SNAPSHOT",
  "MARKET_RUN_RULES",
  "MARKET_REINDEX_PROPERTY",
  "MARKET_PUSH_ADVERTISER_TO_INMOVILLA",
];

interface Step {
  name: string;
  count: () => Promise<number>;
  apply: () => Promise<number>;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const steps: Step[] = [
      {
        name: "JobQueue MARKET_*",
        count: () =>
          prisma.jobQueue.count({
            where: { type: { in: MARKET_JOB_TYPES } },
          }),
        apply: async () => {
          const r = await prisma.jobQueue.deleteMany({
            where: { type: { in: MARKET_JOB_TYPES } },
          });
          return r.count;
        },
      },
      {
        name: "MarketEvent",
        count: () => prisma.marketEvent.count(),
        apply: async () => (await prisma.marketEvent.deleteMany()).count,
      },
      {
        name: "MarketListingVersion",
        count: () => prisma.marketListingVersion.count(),
        apply: async () =>
          (await prisma.marketListingVersion.deleteMany()).count,
      },
      {
        name: "MarketListing",
        count: () => prisma.marketListing.count(),
        apply: async () => (await prisma.marketListing.deleteMany()).count,
      },
      {
        name: "MarketRawListing",
        count: () => prisma.marketRawListing.count(),
        apply: async () => (await prisma.marketRawListing.deleteMany()).count,
      },
      {
        name: "MarketCrawlRun",
        count: () => prisma.marketCrawlRun.count(),
        apply: async () => (await prisma.marketCrawlRun.deleteMany()).count,
      },
      {
        name: "MarketAdvertiser",
        count: () => prisma.marketAdvertiser.count(),
        apply: async () => (await prisma.marketAdvertiser.deleteMany()).count,
      },
      {
        name: "MarketProperty",
        count: () => prisma.marketProperty.count(),
        apply: async () => (await prisma.marketProperty.deleteMany()).count,
      },
      {
        name: "MarketSnapshotIndex",
        count: () => prisma.marketSnapshotIndex.count(),
        apply: async () =>
          (await prisma.marketSnapshotIndex.deleteMany()).count,
      },
    ];

    console.log(
      `[wipe-market] mode=${CONFIRM ? "APPLY" : "DRY-RUN"} (set MARKET_WIPE_CONFIRM=WIPE para aplicar)`,
    );

    const counts = await Promise.all(steps.map((s) => s.count()));
    for (let i = 0; i < steps.length; i++) {
      console.log(`  ${steps[i]!.name}: ${counts[i]}`);
    }

    if (!CONFIRM) {
      console.log("[wipe-market] DRY-RUN — nada borrado");
      return;
    }

    console.log("[wipe-market] APLICANDO en orden seguro...");
    for (const step of steps) {
      const deleted = await step.apply();
      console.log(`  - ${step.name}: ${deleted} eliminados`);
    }

    const seedCount = await prisma.marketSeed.count();
    console.log(
      `[wipe-market] hecho. MarketSeed conservados=${seedCount} (intactos).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[wipe-market] fatal", err);
  process.exit(1);
});
