/**
 * Diagnóstico rápido del estado del Core Mercado en la DB activa.
 * Imprime conteos básicos para entender por qué la UI no muestra propiedades.
 */
import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    const [seeds, rawListings, listings, properties, jobs] = await Promise.all([
      prisma.marketSeed.groupBy({
        by: ["source", "active"],
        _count: { _all: true },
      }),
      prisma.marketRawListing.groupBy({
        by: ["source", "status"],
        _count: { _all: true },
      }),
      prisma.marketListing.groupBy({
        by: ["source", "status"],
        _count: { _all: true },
      }),
      prisma.marketProperty.count(),
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
              "MARKET_REFRESH_SNAPSHOT",
              "MARKET_IMPORT_LISTING_IMAGES",
            ],
          },
        },
      }),
    ]);

    console.log("=== Market State ===");
    console.log("\nMarketSeed (por source/active):");
    console.log(JSON.stringify(seeds, null, 2));
    console.log("\nMarketRawListing (por source/status):");
    console.log(JSON.stringify(rawListings, null, 2));
    console.log("\nMarketListing (por source/status):");
    console.log(JSON.stringify(listings, null, 2));
    console.log(`\nMarketProperty count: ${properties}`);
    console.log("\nJobQueue Market jobs:");
    console.log(JSON.stringify(jobs, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("error:", err);
  process.exit(1);
});
