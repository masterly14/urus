/**
 * Diagnóstico rápido del estado de los `MarketCircuitBreaker` por source.
 * Si un breaker está OPEN, `discoverDueSeeds`/`runCrawlTick` saltarán esa source
 * silenciosamente, lo que explica que aparezcan 0 raws para `source_a`/`source_b`.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    const breakers = await prisma.marketCircuitBreaker.findMany({
      orderBy: { source: "asc" },
      select: {
        source: true,
        status: true,
        failureCount: true,
        openedAt: true,
        halfOpenAt: true,
        closedAt: true,
        updatedAt: true,
      },
    });
    if (breakers.length === 0) {
      console.log("(sin filas en MarketCircuitBreaker — los crawls fallarán por seguridad)");
      return;
    }
    console.table(
      breakers.map((b) => ({
        source: b.source,
        status: b.status,
        failures: b.failureCount,
        openedAt: b.openedAt?.toISOString() ?? "-",
        halfOpenAt: b.halfOpenAt?.toISOString() ?? "-",
        closedAt: b.closedAt?.toISOString() ?? "-",
        updatedAt: b.updatedAt.toISOString(),
      })),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("error:", err);
  process.exit(1);
});
