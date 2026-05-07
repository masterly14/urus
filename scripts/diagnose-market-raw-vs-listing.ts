import "dotenv/config";
import { PrismaClient } from "@prisma/client";

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const rawBySource = await prisma.marketRawListing.groupBy({
      by: ["source", "status"],
      _count: { _all: true },
      orderBy: [{ source: "asc" }, { status: "asc" }],
    });
    const listingBySource = await prisma.marketListing.groupBy({
      by: ["source", "status"],
      _count: { _all: true },
      orderBy: [{ source: "asc" }, { status: "asc" }],
    });
    console.log("RAW:");
    console.log(JSON.stringify(rawBySource, null, 2));
    console.log("\nLISTING:");
    console.log(JSON.stringify(listingBySource, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
