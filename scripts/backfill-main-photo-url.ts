/**
 * Backfill one-shot: deriva `mainPhotoUrl` desde `property_snapshots.raw`
 * (numagencia + cod_ofer + fotoletra) y lo persiste en:
 *   - property_snapshots.mainPhotoUrl
 *   - properties_current.mainPhotoUrl
 *
 * No hace llamadas a Inmovilla: usa los datos ya presentes en snapshot.raw
 * capturados por ciclos de ingestión anteriores. Ideal para poblar la UI
 * de Smart Pricing sin esperar al siguiente ciclo de modificación.
 *
 * Uso:
 *   npx tsx scripts/backfill-main-photo-url.ts
 *   npx tsx scripts/backfill-main-photo-url.ts --dry-run
 */

import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { buildMainPhotoUrlFromRaw } from "@/lib/inmovilla/rest/photo-url";

const dryRun = process.argv.includes("--dry-run");

async function main(): Promise<void> {
  console.log("Backfill mainPhotoUrl desde property_snapshots.raw\n");

  const snapshots = await prisma.propertySnapshot.findMany({
    where: { nodisponible: false, prospecto: false },
    select: { codigo: true, ref: true, raw: true, mainPhotoUrl: true },
  });

  console.log(`Snapshots activos: ${snapshots.length}`);

  let derivable = 0;
  let toUpdate = 0;
  let noDeriv = 0;
  const updates: { codigo: string; url: string; ref: string }[] = [];

  for (const row of snapshots) {
    const raw = (row.raw ?? {}) as Record<string, unknown>;
    const url = buildMainPhotoUrlFromRaw(raw);
    if (!url) {
      noDeriv++;
      continue;
    }
    derivable++;
    if (row.mainPhotoUrl !== url) {
      toUpdate++;
      updates.push({ codigo: row.codigo, url, ref: row.ref });
    }
  }

  console.log(`  · Derivables con raw actual:        ${derivable}`);
  console.log(`  · No derivables (falta algún dato): ${noDeriv}`);
  console.log(`  · A actualizar (valor distinto):    ${toUpdate}\n`);

  if (updates.length > 0) {
    console.log("Ejemplos:");
    for (const u of updates.slice(0, 5)) {
      console.log(`  · [${u.codigo}] ${u.ref} → ${u.url}`);
    }
    console.log("");
  }

  if (dryRun) {
    console.log("--dry-run: sin cambios en DB.");
    await prisma.$disconnect();
    return;
  }

  let snapshotsUpdated = 0;
  let currentUpdated = 0;

  for (const u of updates) {
    await prisma.propertySnapshot.update({
      where: { codigo: u.codigo },
      data: { mainPhotoUrl: u.url },
    });
    snapshotsUpdated++;

    const res = await prisma.propertyCurrent.updateMany({
      where: { codigo: u.codigo },
      data: { mainPhotoUrl: u.url },
    });
    currentUpdated += res.count;
  }

  console.log(`property_snapshots actualizados: ${snapshotsUpdated}`);
  console.log(`properties_current actualizados: ${currentUpdated}`);

  const finalWithPhoto = await prisma.propertyCurrent.count({
    where: {
      nodisponible: false,
      prospecto: false,
      mainPhotoUrl: { not: null },
    },
  });
  const finalActive = await prisma.propertyCurrent.count({
    where: { nodisponible: false, prospecto: false },
  });

  console.log(
    `\nEstado final PropertyCurrent: ${finalWithPhoto}/${finalActive} con mainPhotoUrl.`,
  );

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await prisma.$disconnect();
  process.exit(1);
});
