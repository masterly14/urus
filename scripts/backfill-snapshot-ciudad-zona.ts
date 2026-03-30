/**
 * Script de backfill: rellena ciudad/zona/estado en PropertySnapshot
 * para los registros que tienen campos con valores numéricos crudos
 * (key_zona almacenado como string en `zona`, código numérico en `estado`).
 *
 * Funciona para snapshots del API legacy (zona y estado tienen claves numéricas)
 * y para los del REST API (usan raw.key_loca / raw.key_zona).
 *
 * Uso: npx tsx --env-file=.env scripts/backfill-snapshot-ciudad-zona.ts
 */
import { prisma } from "../lib/prisma";
import { loadEnumLookupMaps } from "../lib/inmovilla/rest/enum-lookup";

async function main() {
  const enumMaps = await loadEnumLookupMaps();
  console.log(
    `Enum maps: ${enumMaps.ciudadByKeyLoca.size} ciudades, ${enumMaps.zonaByLocaZona.size} zonas, ${enumMaps.estadoByValue.size} estados`,
  );

  // Mapa adicional: key_zona → { zona, key_loca } para snapshots legacy
  const zonas = await prisma.inmovillaEnumZona.findMany({
    select: { key_zona: true, key_loca: true, zona: true },
  });
  const zonaByKeyZona = new Map<number, { zona: string; key_loca: number }>();
  for (const z of zonas) {
    // Si hay duplicados, el último gana (habitualmente key_zona es único por ciudad)
    if (!zonaByKeyZona.has(z.key_zona)) {
      zonaByKeyZona.set(z.key_zona, { zona: z.zona, key_loca: z.key_loca });
    }
  }

  const snapshots = await prisma.propertySnapshot.findMany({
    where: { OR: [{ ciudad: "" }] },
    select: { codigo: true, ciudad: true, zona: true, estado: true, raw: true },
  });

  console.log(`Snapshots con ciudad vacía: ${snapshots.length}`);
  if (snapshots.length === 0) {
    console.log("Nada que actualizar.");
    return;
  }

  let updated = 0;
  let notResolved = 0;

  for (const snap of snapshots) {
    const raw = snap.raw as Record<string, unknown> | null;

    // --- Resolver ciudad y zona ---
    let ciudadResolved = snap.ciudad;
    let zonaResolved = snap.zona;
    let estadoResolved = snap.estado;

    // Intentar desde raw REST (tiene key_loca / key_zona como números)
    if (raw && typeof raw.key_loca === "number") {
      const keyLoca = raw.key_loca as number;
      const keyZona = typeof raw.key_zona === "number" ? (raw.key_zona as number) : undefined;

      if (!ciudadResolved) {
        ciudadResolved = enumMaps.ciudadByKeyLoca.get(keyLoca) ?? "";
      }
      if (keyZona != null) {
        const zonaLookup = enumMaps.zonaByLocaZona.get(`${keyLoca}:${keyZona}`);
        if (zonaLookup) zonaResolved = zonaLookup;
      }
    }

    // Intentar desde zona almacenada como key_zona numérico (snapshots legacy)
    if (!ciudadResolved || /^\d+$/.test(zonaResolved)) {
      const keyZonaNum = /^\d+$/.test(snap.zona) ? parseInt(snap.zona, 10) : undefined;
      if (keyZonaNum != null) {
        const found = zonaByKeyZona.get(keyZonaNum);
        if (found) {
          if (!ciudadResolved) {
            ciudadResolved = enumMaps.ciudadByKeyLoca.get(found.key_loca) ?? "";
          }
          zonaResolved = found.zona;
        }
      }
    }

    // Resolver estado numérico (ej: "3" → "Libre")
    if (/^\d+$/.test(estadoResolved)) {
      const estadoNum = parseInt(estadoResolved, 10);
      const estadoLabel = enumMaps.estadoByValue.get(estadoNum);
      if (estadoLabel) estadoResolved = estadoLabel;
    }

    const changed =
      ciudadResolved !== snap.ciudad ||
      zonaResolved !== snap.zona ||
      estadoResolved !== snap.estado;

    if (!changed) {
      notResolved++;
      continue;
    }

    await prisma.propertySnapshot.update({
      where: { codigo: snap.codigo },
      data: {
        ciudad: ciudadResolved,
        zona: zonaResolved,
        estado: estadoResolved,
      },
    });

    console.log(
      `  [${snap.codigo}] ciudad="${ciudadResolved}" zona="${zonaResolved.substring(0, 35)}" estado="${estadoResolved}"`,
    );
    updated++;
  }

  console.log(`\nCompletado: ${updated} actualizados, ${notResolved} no resolvibles (sin enum).`);
}

main().catch(console.error);
