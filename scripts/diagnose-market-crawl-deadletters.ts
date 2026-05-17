/**
 * Inspecciona los últimos `MARKET_CRAWL_SEED` en DEAD_LETTER para entender por
 * qué `source_a` (pisos.com) y `source_b` (fotocasa) no producen raws.
 *
 * Imprime el job, el seed referenciado y el `lastError` recortado.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    const jobs = await prisma.jobQueue.findMany({
      where: { type: "MARKET_CRAWL_SEED", status: "DEAD_LETTER" },
      orderBy: { failedAt: "desc" },
      take: 25,
      select: {
        id: true,
        attempts: true,
        failedAt: true,
        payload: true,
        lastError: true,
      },
    });

    if (jobs.length === 0) {
      console.log("(sin jobs DEAD_LETTER)");
      return;
    }

    const seedIds = Array.from(
      new Set(
        jobs
          .map((j) => (j.payload as { seedId?: string } | null)?.seedId)
          .filter((id): id is string => typeof id === "string"),
      ),
    );
    const seeds = await prisma.marketSeed.findMany({
      where: { id: { in: seedIds } },
      select: {
        id: true,
        source: true,
        operation: true,
        city: true,
        zone: true,
        url: true,
        active: true,
        cadenceMinutes: true,
        lastRunAt: true,
        notes: true,
      },
    });
    const seedById = new Map(seeds.map((s) => [s.id, s]));

    for (const j of jobs) {
      const payload = j.payload as { seedId?: string } | null;
      const seed = payload?.seedId ? seedById.get(payload.seedId) : null;
      console.log("---");
      console.log(`jobId=${j.id} attempts=${j.attempts} failedAt=${j.failedAt?.toISOString() ?? "-"}`);
      if (seed) {
        console.log(
          `seed: source=${seed.source} op=${seed.operation} city=${seed.city ?? "-"} zone=${seed.zone ?? "-"} active=${seed.active} cadenceMin=${seed.cadenceMinutes} lastRunAt=${seed.lastRunAt?.toISOString() ?? "-"}`,
        );
        if (seed.url) console.log(`seed.url=${seed.url}`);
        if (seed.notes) console.log(`seed.notes=${seed.notes}`);
      } else {
        console.log(`seed=(no encontrada, payload=${JSON.stringify(payload)})`);
      }
      console.log(`lastError: ${(j.lastError ?? "").slice(0, 600)}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("error:", err);
  process.exit(1);
});
