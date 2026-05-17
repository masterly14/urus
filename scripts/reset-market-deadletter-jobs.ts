/**
 * Borra `MARKET_CRAWL_SEED` en estado DEAD_LETTER cuya `payload.source` esté
 * en la lista pasada por argv (default: source_a, source_b).
 *
 * Esto libera la `idempotencyKey` (que mientras dura la ventana de cadencia
 * impide encolar otro job para el mismo seed) y permite que el siguiente
 * `discoverDueSeeds` cree jobs nuevos limpios para reintentar el crawl.
 *
 * NO toca `source_d` por defecto (ya tiene raws válidos en producción).
 *
 * Uso:
 *   npx tsx scripts/reset-market-deadletter-jobs.ts                # source_a + source_b
 *   npx tsx scripts/reset-market-deadletter-jobs.ts source_a       # solo source_a
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const VALID = ["source_a", "source_b", "source_d"] as const;
type Src = (typeof VALID)[number];

async function main() {
  const args = process.argv.slice(2);
  const targets = (args.length > 0
    ? args.filter((a): a is Src => (VALID as readonly string[]).includes(a))
    : (["source_a", "source_b"] as Src[])) as Src[];
  if (targets.length === 0) {
    console.error("[reset-dl] no hay sources válidos en argv");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const candidates = await prisma.jobQueue.findMany({
      where: { type: "MARKET_CRAWL_SEED", status: "DEAD_LETTER" },
      select: { id: true, idempotencyKey: true, payload: true, failedAt: true },
    });
    const toDelete = candidates.filter((j) => {
      const src = (j.payload as { source?: string } | null)?.source;
      return typeof src === "string" && (targets as string[]).includes(src);
    });

    console.log(
      `[reset-dl] DEAD_LETTER MARKET_CRAWL_SEED candidatos=${candidates.length}, a borrar=${toDelete.length} (sources=${targets.join(",")})`,
    );
    for (const j of toDelete) {
      console.log(
        `  - ${j.id} key=${j.idempotencyKey ?? "(no-key)"} failedAt=${j.failedAt?.toISOString() ?? "-"}`,
      );
    }

    if (toDelete.length === 0) {
      console.log("[reset-dl] nada que borrar");
      return;
    }

    const result = await prisma.jobQueue.deleteMany({
      where: { id: { in: toDelete.map((j) => j.id) } },
    });
    console.log(`[reset-dl] eliminados=${result.count}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("error:", err);
  process.exit(1);
});
