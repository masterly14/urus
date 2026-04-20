import "dotenv/config";
import { prisma } from "@/lib/prisma";

async function main(): Promise<void> {
  const missing = await prisma.propertyCurrent.findMany({
    where: { nodisponible: false, prospecto: false, mainPhotoUrl: null },
    select: { codigo: true, ref: true, numFotos: true },
  });
  console.log(`Activas sin mainPhotoUrl: ${missing.length}\n`);

  for (const m of missing) {
    const snap = await prisma.propertySnapshot.findUnique({
      where: { codigo: m.codigo },
      select: {
        nodisponible: true,
        prospecto: true,
        mainPhotoUrl: true,
        raw: true,
      },
    });
    if (!snap) {
      console.log(`  · ${m.codigo} ${m.ref} numFotos=${m.numFotos} → SIN SNAPSHOT`);
      continue;
    }
    const raw = (snap.raw ?? {}) as Record<string, unknown>;
    console.log(
      `  · ${m.codigo} ${m.ref} numFotos(current)=${m.numFotos} | snap: nodisp=${snap.nodisponible} prosp=${snap.prospecto} fotoletra=${raw.fotoletra ?? "∅"} numagencia=${raw.numagencia ?? "∅"} numfotos=${raw.numfotos ?? "∅"} url=${snap.mainPhotoUrl ?? "∅"}`,
    );
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await prisma.$disconnect();
  process.exit(1);
});
