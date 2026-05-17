/**
 * Borra `MARKET_CRAWL_SEED` en estado `COMPLETED` cuya `idempotencyKey`
 * pertenece al bucket de cadencia actual (mismo `Math.floor(now / cadenceMin)`
 * que `discoverDueSeeds` usa). Esto libera las keys para que el siguiente
 * discover cree jobs nuevos limpios sin esperar a que cambie la ventana.
 *
 * Mitigación al bug detectado en `lib/market/scheduler.ts` (líneas ~200-225):
 * `enqueueJob` con `idempotencyKey` existente devuelve el job en cualquier
 * estado terminal (COMPLETED, DEAD_LETTER, etc.), pero el scheduler asume
 * que solo reusa cuando hay un `P2002` (que `enqueueJob` captura
 * internamente y nunca propaga). Resultado: imposible reintentar dentro
 * de la misma ventana de cadencia hasta que el bucket cambie.
 *
 * SOLO borra `MARKET_CRAWL_SEED` en `COMPLETED`. No toca DEAD_LETTER
 * (usar `reset-market-deadletter-jobs.ts` para eso).
 *
 * Uso:
 *   npx tsx scripts/reset-market-completed-crawl-seed-current-bucket.ts
 *   npx tsx scripts/reset-market-completed-crawl-seed-current-bucket.ts source_a
 *   npx tsx scripts/reset-market-completed-crawl-seed-current-bucket.ts --dry
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const VALID = ["source_a", "source_b", "source_d"] as const;

function bucket(now: Date, cadenceMinutes: number): number {
  const windowMs = Math.max(60, cadenceMinutes) * 60_000;
  return Math.floor(now.getTime() / windowMs);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry");
  const positional = args.filter((a) => !a.startsWith("--"));
  const filterSource = positional[0] && (VALID as readonly string[]).includes(positional[0])
    ? positional[0]
    : undefined;

  const prisma = new PrismaClient();
  try {
    const now = new Date();

    const seedsWhere: { active: true; source?: string } = { active: true };
    if (filterSource) seedsWhere.source = filterSource;
    const seeds = await prisma.marketSeed.findMany({
      where: seedsWhere as Record<string, unknown>,
      select: { id: true, source: true, cadenceMinutes: true, url: true },
    });

    const expectedKeys = seeds.map((s) => ({
      source: s.source,
      url: s.url,
      key: `market:crawl:${s.id}:${bucket(now, s.cadenceMinutes)}`,
    }));

    console.log(
      `[reset-completed] bucket actual @ ${now.toISOString()} → ${expectedKeys.length} idempotency keys candidatas:`,
    );
    for (const k of expectedKeys) {
      console.log(`  - ${k.source} ${k.key}  ${k.url ?? ""}`);
    }

    const candidates = await prisma.jobQueue.findMany({
      where: {
        type: "MARKET_CRAWL_SEED",
        status: "COMPLETED",
        idempotencyKey: { in: expectedKeys.map((k) => k.key) },
      },
      select: { id: true, idempotencyKey: true, payload: true, completedAt: true },
    });

    console.log(`\n[reset-completed] jobs COMPLETED con esa key: ${candidates.length}`);
    for (const j of candidates) {
      const src = (j.payload as { source?: string } | null)?.source ?? "-";
      console.log(
        `  - ${j.id} src=${src} completedAt=${j.completedAt?.toISOString() ?? "-"} key=${j.idempotencyKey ?? "-"}`,
      );
    }

    if (candidates.length === 0) {
      console.log("[reset-completed] nada que borrar");
      return;
    }

    if (dryRun) {
      console.log("[reset-completed] dry-run: no se modifica nada");
      return;
    }

    const deleted = await prisma.jobQueue.deleteMany({
      where: { id: { in: candidates.map((j) => j.id) } },
    });
    console.log(`[reset-completed] eliminados=${deleted.count}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("error:", err);
  process.exit(1);
});
