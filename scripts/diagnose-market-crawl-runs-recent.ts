/**
 * Inspecciona los `MarketCrawlRun` más recientes para entender qué reportó el
 * worker tras cada crawl: ¿status, listings extraídos, errores?
 *
 * Uso:
 *   npx tsx scripts/diagnose-market-crawl-runs-recent.ts            # últimos 30 min
 *   npx tsx scripts/diagnose-market-crawl-runs-recent.ts 60 source_a
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

async function main() {
  const minutes = Number(process.argv[2] ?? 30);
  const filterSource = process.argv[3];
  const since = new Date(Date.now() - minutes * 60_000);

  const prisma = new PrismaClient();
  try {
    const where: { startedAt: { gte: Date }; source?: string } = { startedAt: { gte: since } };
    if (filterSource) where.source = filterSource;

    const runs = await prisma.marketCrawlRun.findMany({
      where: where as Record<string, unknown>,
      orderBy: { startedAt: "desc" },
      take: 50,
    });

    if (runs.length === 0) {
      console.log("(sin runs)");
      return;
    }

    const seedIds = Array.from(new Set(runs.map((r) => r.seedId)));
    const seeds = await prisma.marketSeed.findMany({
      where: { id: { in: seedIds } },
      select: { id: true, source: true, url: true, operation: true },
    });
    const seedById = new Map(seeds.map((s) => [s.id, s]));

    console.log(`MarketCrawlRun últimos ${minutes} min${filterSource ? ` (source=${filterSource})` : ""}: ${runs.length}`);

    const summary = runs.reduce<Record<string, Record<string, number>>>((acc, r) => {
      acc[r.source] ??= {};
      acc[r.source][r.status] = (acc[r.source][r.status] ?? 0) + 1;
      return acc;
    }, {});
    console.log("byStatus:", JSON.stringify(summary, null, 2));

    for (const r of runs) {
      const seed = seedById.get(r.seedId);
      const dur = r.finishedAt && r.startedAt
        ? `${Math.round((r.finishedAt.getTime() - r.startedAt.getTime()) / 1000)}s`
        : "-";
      console.log("---");
      console.log(
        `${r.id} ${r.source} status=${r.status} startedAt=${r.startedAt.toISOString()} finished=${r.finishedAt?.toISOString() ?? "-"} dur=${dur}`,
      );
      if (seed) {
        console.log(`  seed=${seed.id} url=${seed.url ?? "-"} op=${seed.operation}`);
      }
      console.log(
        `  listingsTotal=${r.listingsTotal ?? "-"} listingsNew=${r.listingsNew ?? "-"} listingsUpdated=${r.listingsUpdated ?? "-"} requests=${r.requestsTotal ?? "-"}`,
      );
      if (r.errorCode || r.errorMessage) {
        console.log(`  error: ${r.errorCode ?? "-"} ${(r.errorMessage ?? "").slice(0, 240)}`);
      }
      if (r.warnings) {
        console.log(`  warnings:`, JSON.stringify(r.warnings).slice(0, 240));
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("error:", err);
  process.exit(1);
});
