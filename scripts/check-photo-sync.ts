import "dotenv/config";
import { prisma } from "@/lib/prisma";

async function main(): Promise<void> {
  const [totalActive, withPhotoCurrent, withPhotoSnapshot, fromRaw] =
    await Promise.all([
      prisma.propertyCurrent.count({
        where: { nodisponible: false, prospecto: false },
      }),
      prisma.propertyCurrent.count({
        where: {
          nodisponible: false,
          prospecto: false,
          mainPhotoUrl: { not: null },
        },
      }),
      prisma.propertySnapshot.count({
        where: {
          nodisponible: false,
          prospecto: false,
          mainPhotoUrl: { not: null },
        },
      }),
      prisma.propertySnapshot.findMany({
        where: { nodisponible: false, prospecto: false },
        select: { codigo: true, ref: true, mainPhotoUrl: true, raw: true },
        take: 200,
      }),
    ]);

  const rawStats = {
    total: fromRaw.length,
    withFotoletra: 0,
    withNumagencia: 0,
    withNumfotosGt0: 0,
    derivableNow: 0,
  };

  for (const row of fromRaw) {
    const raw = (row.raw ?? {}) as Record<string, unknown>;
    const fotoletra = raw.fotoletra;
    const numagencia = raw.numagencia;
    const numfotos = Number(raw.numfotos ?? 0);
    if (fotoletra) rawStats.withFotoletra++;
    if (numagencia) rawStats.withNumagencia++;
    if (numfotos > 0) rawStats.withNumfotosGt0++;
    if (fotoletra && numagencia && numfotos > 0) rawStats.derivableNow++;
  }

  console.log(`\nEstado de sincronización de fotos:\n`);
  console.log(`PropertyCurrent (activas, no prospecto): ${totalActive}`);
  console.log(`  · Con mainPhotoUrl: ${withPhotoCurrent}`);
  console.log(`  · Sin mainPhotoUrl: ${totalActive - withPhotoCurrent}`);
  console.log(`\nPropertySnapshot (espejo del worker):`);
  console.log(`  · Con mainPhotoUrl: ${withPhotoSnapshot}`);
  console.log(
    `\nDatos crudos disponibles en snapshot.raw (${rawStats.total} filas inspeccionadas):`,
  );
  console.log(`  · Con fotoletra: ${rawStats.withFotoletra}`);
  console.log(`  · Con numagencia: ${rawStats.withNumagencia}`);
  console.log(`  · Con numfotos > 0: ${rawStats.withNumfotosGt0}`);
  console.log(
    `  · Derivables a URL de foto ahora mismo (todos los campos): ${rawStats.derivableNow}`,
  );

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await prisma.$disconnect();
  process.exit(1);
});
