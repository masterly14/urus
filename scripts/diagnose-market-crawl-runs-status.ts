/**
 * Resume el estado actual de `MarketCrawlRun` por source/status, para entender
 * cuántos runs hay completados, fallidos, en curso, parciales, y cuántos
 * raws produjo cada uno.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    const grouped = await prisma.marketCrawlRun.groupBy({
      by: ["source", "status"],
      _count: { _all: true },
      _sum: { itemsCaptured: true, itemsRejected: true, pagesScanned: true },
      orderBy: [{ source: "asc" }, { status: "asc" }],
    });
    console.log("MarketCrawlRun por source/status:");
    console.table(
      grouped.map((g) => ({
        source: g.source,
        status: g.status,
        count: g._count._all,
        itemsCaptured: g._sum.itemsCaptured ?? 0,
        itemsRejected: g._sum.itemsRejected ?? 0,
        pagesScanned: g._sum.pagesScanned ?? 0,
      })),
    );

    const lastFinished = await prisma.marketCrawlRun.findMany({
      where: { status: { in: ["COMPLETED", "FAILED", "PARTIAL"] } },
      orderBy: { finishedAt: "desc" },
      take: 12,
      select: {
        id: true,
        source: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        itemsCaptured: true,
        pagesScanned: true,
        errorCode: true,
        errorMessage: true,
      },
    });
    console.log("\nÚltimos 12 runs cerrados:");
    for (const r of lastFinished) {
      const dur =
        r.finishedAt && r.startedAt
          ? `${Math.round((r.finishedAt.getTime() - r.startedAt.getTime()) / 1000)}s`
          : "-";
      console.log(
        `  ${r.source} ${r.status} dur=${dur} captured=${r.itemsCaptured ?? "-"} pages=${r.pagesScanned ?? "-"} startedAt=${r.startedAt.toISOString()}${r.errorCode ? ` err=${r.errorCode}` : ""}`,
      );
      if (r.errorMessage) {
        console.log(`     ${r.errorMessage.slice(0, 200)}`);
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
