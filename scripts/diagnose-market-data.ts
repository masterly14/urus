/**
 * Diagnostico rapido de calidad de datos en MarketListing.
 * Imprime, por source, cuantas rows tienen precio/dir/foto/lat-lng/zone.
 *
 * Uso: npx tsx scripts/diagnose-market-data.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const sources = ["source_a", "source_b", "source_c", "source_d"] as const;
    for (const source of sources) {
      const total = await prisma.marketListing.count({ where: { source } });
      if (total === 0) {
        console.log(`${source}: 0 rows`);
        continue;
      }
      const withPrice = await prisma.marketListing.count({
        where: { source, price: { not: null, gt: 0 } },
      });
      const withAddr = await prisma.marketListing.count({
        where: { source, addressApprox: { not: null } },
      });
      const withImg = await prisma.marketListing.count({
        where: { source, mainImageUrl: { not: null } },
      });
      const withCoords = await prisma.marketListing.count({
        where: { source, lat: { not: null }, lng: { not: null } },
      });
      const withZone = await prisma.marketListing.count({
        where: { source, zone: { not: null } },
      });
      const withPhone = await prisma.marketListing.count({
        where: { source, phones: { isEmpty: false } },
      });
      console.log(
        `${source}: total=${total} price=${withPrice} addr=${withAddr} img=${withImg} coords=${withCoords} zone=${withZone} phone=${withPhone}`,
      );
    }

    const recent = await prisma.marketListing.findMany({
      take: 4,
      orderBy: { lastSeenAt: "desc" },
      select: {
        id: true,
        source: true,
        price: true,
        addressApprox: true,
        zone: true,
        mainImageUrl: true,
        canonicalUrl: true,
        builtArea: true,
        rooms: true,
        phones: true,
      },
    });
    console.log("\nRecientes:");
    for (const r of recent) {
      console.log(JSON.stringify(r));
    }

    const runs = await prisma.marketCrawlRun.findMany({
      where: { source: "source_d" },
      orderBy: { startedAt: "desc" },
      take: 5,
      select: {
        id: true,
        status: true,
        pagesScanned: true,
        itemsCaptured: true,
        itemsRejected: true,
        blockedCount: true,
        errorCode: true,
        errorMessage: true,
        startedAt: true,
        finishedAt: true,
      },
    });
    console.log("\nUltimos runs Idealista:");
    for (const r of runs) {
      console.log(JSON.stringify(r));
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
