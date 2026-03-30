/**
 * Backfill de PropertyCurrent: resuelve ciudad/zona/estado con valores numéricos
 * crudos (key_zona en `zona`, estadoficha en `estado`) usando las tablas enum.
 *
 * Uso: npx tsx --env-file=.env scripts/backfill-current-ciudad-zona.ts
 */
import { prisma } from "../lib/prisma";
import { loadEnumLookupMaps } from "../lib/inmovilla/rest/enum-lookup";

async function main() {
  const enumMaps = await loadEnumLookupMaps();

  // Mapa key_zona → { zona, key_loca } para resolver ciudad desde zona
  const zonas = await prisma.inmovillaEnumZona.findMany({
    select: { key_zona: true, key_loca: true, zona: true },
  });
  const zonaByKeyZona = new Map<number, { zona: string; key_loca: number }>();
  for (const z of zonas) {
    if (!zonaByKeyZona.has(z.key_zona)) {
      zonaByKeyZona.set(z.key_zona, { zona: z.zona, key_loca: z.key_loca });
    }
  }

  console.log(
    `Enum maps: ${enumMaps.ciudadByKeyLoca.size} ciudades, ${zonaByKeyZona.size} zonas únicas, ${enumMaps.estadoByValue.size} estados`,
  );

  const records = await prisma.propertyCurrent.findMany({
    where: { OR: [{ ciudad: "" }] },
    select: { codigo: true, ciudad: true, zona: true, estado: true },
  });

  console.log(`PropertyCurrent a actualizar: ${records.length}`);
  if (records.length === 0) {
    console.log("Nada que actualizar.");
    return;
  }

  let updated = 0;
  let notResolved = 0;

  for (const rec of records) {
    let ciudadResolved = rec.ciudad;
    let zonaResolved = rec.zona;
    let estadoResolved = rec.estado;

    // Resolver zona (almacenada como key_zona numérico)
    if (/^\d+$/.test(rec.zona)) {
      const keyZonaNum = parseInt(rec.zona, 10);
      const found = zonaByKeyZona.get(keyZonaNum);
      if (found) {
        zonaResolved = found.zona;
        if (!ciudadResolved) {
          ciudadResolved = enumMaps.ciudadByKeyLoca.get(found.key_loca) ?? "";
        }
      }
    }

    // Resolver estado (almacenado como estadoficha numérico)
    if (/^\d+$/.test(rec.estado)) {
      const estadoNum = parseInt(rec.estado, 10);
      const label = enumMaps.estadoByValue.get(estadoNum);
      if (label) estadoResolved = label;
    }

    const changed =
      ciudadResolved !== rec.ciudad ||
      zonaResolved !== rec.zona ||
      estadoResolved !== rec.estado;

    if (!changed) {
      notResolved++;
      continue;
    }

    await prisma.propertyCurrent.update({
      where: { codigo: rec.codigo },
      data: { ciudad: ciudadResolved, zona: zonaResolved, estado: estadoResolved },
    });

    console.log(
      `  [${rec.codigo}] ciudad="${ciudadResolved}" zona="${zonaResolved.substring(0, 35)}" estado="${estadoResolved}"`,
    );
    updated++;
  }

  console.log(`\nCompletado: ${updated} actualizados, ${notResolved} no resolvibles.`);
}

main().catch(console.error);
