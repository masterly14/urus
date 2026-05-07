/**
 * Distribucion de advertiserType y telefonos por source. Permite estimar
 * cuantos jobs de detalle vamos a encolar bajo la politica nueva.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const sources = ["source_a", "source_b", "source_c", "source_d"] as const;
    for (const source of sources) {
      const total = await prisma.marketListing.count({ where: { source } });
      if (total === 0) continue;
      const particularNoPhone = await prisma.marketListing.count({
        where: {
          source,
          advertiserType: "particular",
          phones: { isEmpty: true },
        },
      });
      const particularWithPhone = await prisma.marketListing.count({
        where: {
          source,
          advertiserType: "particular",
          phones: { isEmpty: false },
        },
      });
      const agency = await prisma.marketListing.count({
        where: { source, advertiserType: "agency" },
      });
      console.log(
        `${source}: total=${total} agency=${agency} particular_with_phone=${particularWithPhone} particular_no_phone=${particularNoPhone}`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
