import "dotenv/config";
import { PrismaClient } from "@prisma/client";

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.jobQueue.groupBy({
      by: ["type", "status"],
      _count: { _all: true },
      where: {
        OR: [
          { type: "MARKET_CRAWL_SEED" },
          { type: "MARKET_NORMALIZE_BATCH" },
          { type: "MARKET_DIFF_AND_VERSION" },
          { type: "MARKET_RESOLVE_ADVERTISER" },
        ],
      },
      orderBy: [{ type: "asc" }, { status: "asc" }],
    });
    console.log(JSON.stringify(rows, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
