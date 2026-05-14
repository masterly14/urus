import "dotenv/config";
import { PrismaClient } from "@prisma/client";

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const all = await prisma.marketListing.findMany({
      where: { source: "source_d" },
      select: { id: true, zone: true },
    });
    const dirtyRe =
      /^(?:piso|casa|chalet|d[uú]plex|[áa]tico|estudio|loft|vivienda|apartamento|finca|terreno)\b/i;
    const dirty = all.filter((r) => r.zone && dirtyRe.test(r.zone));
    console.log(
      JSON.stringify(
        {
          total: all.length,
          stillDirty: dirty.length,
          examples: dirty.slice(0, 5).map((r) => r.zone),
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
