/**
 * Resetea `MarketSeed.lastRunAt = null` en seeds activos para que
 * `discoverDueSeeds` los considere elegibles inmediatamente sin esperar la
 * cadencia (útil cuando un cron previo falló por auth/red y se re-deshabilitó).
 *
 * Uso:
 *   npx tsx scripts/reset-market-seeds-last-run.ts                 # todos los activos
 *   npx tsx scripts/reset-market-seeds-last-run.ts source_a source_b
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import type { MarketSource } from "@prisma/client";

const VALID_SOURCES: MarketSource[] = ["source_a", "source_b", "source_d"];

async function main() {
  const args = process.argv.slice(2);
  const sources =
    args.length > 0
      ? (args.filter((a): a is MarketSource =>
          (VALID_SOURCES as string[]).includes(a),
        ) as MarketSource[])
      : VALID_SOURCES;

  const prisma = new PrismaClient();
  try {
    const before = await prisma.marketSeed.findMany({
      where: { active: true, source: { in: sources } },
      select: { id: true, source: true, url: true, lastRunAt: true },
      orderBy: { source: "asc" },
    });
    console.log(`[reset] seeds activos en ${sources.join(",")}: ${before.length}`);
    for (const s of before) {
      console.log(
        `  - ${s.source} ${s.id} lastRunAt=${s.lastRunAt?.toISOString() ?? "null"} ${s.url ?? ""}`,
      );
    }
    const updated = await prisma.marketSeed.updateMany({
      where: { active: true, source: { in: sources } },
      data: { lastRunAt: null },
    });
    console.log(`[reset] lastRunAt=null actualizado en ${updated.count} seeds.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("error:", err);
  process.exit(1);
});
