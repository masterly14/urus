/**
 * Purga jobs MARKET_FETCH_DETAIL en estado PENDING/IN_PROGRESS para listings
 * que ya no aplican bajo la politica nueva (solo particulares).
 *
 * Motivo: el backfill anterior encolo 189 jobs (incluyendo agencias). Bajo
 * la politica nueva, las agencias se descartan en el handler con success
 * (no-op), pero igual ocupan slots y producen ruido. Mejor purgarlos.
 *
 * Modo:
 *  - DRY RUN por defecto. `MARKET_PURGE_DRY_RUN=0` para aplicar.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const DRY_RUN = String(process.env.MARKET_PURGE_DRY_RUN ?? "1") !== "0";

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const total = await prisma.jobQueue.count({
      where: {
        type: "MARKET_FETCH_DETAIL",
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
    });
    console.log(
      `[purge-detail] PENDING+IN_PROGRESS encontrados: ${total} (dryRun=${DRY_RUN})`,
    );

    if (DRY_RUN) return;

    const result = await prisma.jobQueue.deleteMany({
      where: {
        type: "MARKET_FETCH_DETAIL",
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
    });
    console.log(`[purge-detail] eliminados: ${result.count}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
