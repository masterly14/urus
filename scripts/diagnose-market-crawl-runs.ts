/**
 * Inspecciona los últimos `MarketCrawlRun` para entender por qué Fotocasa/Pisos.com
 * no devolvieron raws.
 */
import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    const runs = await prisma.marketCrawlRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 25,
      select: {
        id: true,
        source: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        pagesScanned: true,
        itemsCaptured: true,
        blockedCount: true,
        errorCode: true,
        errorMessage: true,
        seed: { select: { url: true, source: true } },
      },
    });

    console.log(`=== Últimos ${runs.length} MarketCrawlRun ===\n`);
    const grouped: Record<string, typeof runs> = {};
    for (const r of runs) {
      grouped[r.source] ??= [];
      grouped[r.source]!.push(r);
    }
    for (const [source, list] of Object.entries(grouped)) {
      console.log(`\n--- ${source} (${list.length} runs) ---`);
      for (const r of list) {
        console.log(
          `  [${r.status}] pages=${r.pagesScanned} items=${r.itemsCaptured} blocked=${r.blockedCount} err=${r.errorCode ?? "-"}`,
        );
        if (r.errorMessage) {
          console.log(`    msg: ${r.errorMessage.slice(0, 240)}`);
        }
        if (r.seed?.url) console.log(`    url: ${r.seed.url}`);
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
