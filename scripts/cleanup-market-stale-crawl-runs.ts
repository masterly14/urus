/**
 * Cierra `MarketCrawlRun` colgados en `RUNNING` cuando ya no hay un job activo
 * en la cola para ese run.
 *
 * Caso de uso típico:
 *   - El worker tomó un job, devolvió `accepted` por deadline, y la promesa de
 *     extracción nunca terminó (cuelgue indefinido en Playwright contra un
 *     antibot, redeploy del proceso a mitad de extracción, etc.).
 *   - El job correspondiente está en COMPLETED/DEAD_LETTER pero el run sigue
 *     en RUNNING para siempre.
 *
 * Política de limpieza:
 *   - Considera runs con `status='RUNNING'` y `startedAt < now - olderThanMin`.
 *   - Filtro opcional por `source`.
 *   - Los marca `status='FAILED'`, `errorCode='STALE_CLEANUP'`,
 *     `errorMessage` con el motivo, `finishedAt=now()`. Esto permite que el
 *     siguiente `discoverDueSeeds` pueda crear un run nuevo limpio.
 *
 * Uso:
 *   npx tsx scripts/cleanup-market-stale-crawl-runs.ts                    # >= 30 min, todos los sources
 *   npx tsx scripts/cleanup-market-stale-crawl-runs.ts 15                 # >= 15 min
 *   npx tsx scripts/cleanup-market-stale-crawl-runs.ts 15 source_a        # >= 15 min, solo source_a
 *   npx tsx scripts/cleanup-market-stale-crawl-runs.ts 15 source_a --dry  # solo lista, no escribe
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const VALID = ["source_a", "source_b", "source_d"] as const;

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry");
  const positional = args.filter((a) => !a.startsWith("--"));
  const olderThanMin = Number(positional[0] ?? 30);
  const filterSource = positional[1] && (VALID as readonly string[]).includes(positional[1])
    ? (positional[1] as (typeof VALID)[number])
    : undefined;

  if (!Number.isFinite(olderThanMin) || olderThanMin <= 0) {
    console.error(`[cleanup-runs] olderThanMin inválido: ${positional[0]}`);
    process.exit(1);
  }

  const cutoff = new Date(Date.now() - olderThanMin * 60_000);

  const prisma = new PrismaClient();
  try {
    const where: { status: "RUNNING"; startedAt: { lt: Date }; source?: string } = {
      status: "RUNNING",
      startedAt: { lt: cutoff },
    };
    if (filterSource) where.source = filterSource;

    const stale = await prisma.marketCrawlRun.findMany({
      where: where as Record<string, unknown>,
      orderBy: { startedAt: "asc" },
      select: { id: true, source: true, seedId: true, startedAt: true, correlationId: true },
    });

    console.log(
      `[cleanup-runs] runs RUNNING con startedAt < ${cutoff.toISOString()}${
        filterSource ? ` (source=${filterSource})` : ""
      }: ${stale.length}`,
    );
    for (const r of stale) {
      const ageMin = Math.round((Date.now() - r.startedAt.getTime()) / 60_000);
      console.log(`  - ${r.id} ${r.source} seed=${r.seedId} startedAt=${r.startedAt.toISOString()} (hace ${ageMin}min)`);
    }

    if (stale.length === 0 || dryRun) {
      if (dryRun) console.log("[cleanup-runs] dry-run: no se modifica nada");
      return;
    }

    const result = await prisma.marketCrawlRun.updateMany({
      where: { id: { in: stale.map((r) => r.id) } },
      data: {
        status: "FAILED",
        errorCode: "STALE_CLEANUP",
        errorMessage: `Run cerrado por mantenimiento (>${olderThanMin}min en RUNNING sin finalizar)`,
        finishedAt: new Date(),
      },
    });
    console.log(`[cleanup-runs] cerrados como FAILED: ${result.count}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("error:", err);
  process.exit(1);
});
