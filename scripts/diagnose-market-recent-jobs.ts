/**
 * Inspecciona los `MARKET_CRAWL_SEED` más recientes (últimos N minutos) para
 * ver qué scheduler los consumió, en qué estado quedaron y, si fallaron, el
 * error.
 *
 * Uso:
 *   npx tsx scripts/diagnose-market-recent-jobs.ts            # últimos 15 min
 *   npx tsx scripts/diagnose-market-recent-jobs.ts 30         # últimos 30 min
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

async function main() {
  const minutes = Number(process.argv[2] ?? 15);
  const since = new Date(Date.now() - minutes * 60_000);

  const prisma = new PrismaClient();
  try {
    const jobs = await prisma.jobQueue.findMany({
      where: {
        type: "MARKET_CRAWL_SEED",
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: {
        id: true,
        status: true,
        attempts: true,
        priority: true,
        idempotencyKey: true,
        availableAt: true,
        lockedBy: true,
        lockedAt: true,
        startedAt: true,
        completedAt: true,
        failedAt: true,
        createdAt: true,
        updatedAt: true,
        payload: true,
        lastError: true,
      },
    });

    console.log(`[recent-jobs] MARKET_CRAWL_SEED creados desde ${since.toISOString()} (${minutes} min): ${jobs.length}`);

    const byStatus = jobs.reduce<Record<string, number>>((acc, j) => {
      acc[j.status] = (acc[j.status] ?? 0) + 1;
      return acc;
    }, {});
    console.log("byStatus:", byStatus);

    for (const j of jobs) {
      const payload = j.payload as { seedId?: string; source?: string } | null;
      console.log("---");
      console.log(
        `${j.id} status=${j.status} attempts=${j.attempts} prio=${j.priority} createdAt=${j.createdAt.toISOString()} updatedAt=${j.updatedAt.toISOString()}`,
      );
      console.log(
        `  seedId=${payload?.seedId ?? "-"} source=${payload?.source ?? "-"} availableAt=${j.availableAt?.toISOString() ?? "-"}`,
      );
      console.log(
        `  lockedBy=${j.lockedBy ?? "-"} lockedAt=${j.lockedAt?.toISOString() ?? "-"} startedAt=${j.startedAt?.toISOString() ?? "-"} completedAt=${j.completedAt?.toISOString() ?? "-"} failedAt=${j.failedAt?.toISOString() ?? "-"}`,
      );
      if (j.lastError) {
        console.log(`  lastError: ${j.lastError.slice(0, 240)}`);
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
