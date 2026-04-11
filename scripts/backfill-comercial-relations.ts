/**
 * Backfill: enlazar Comercial con Inmovilla keyagente y rellenar
 * comercialId en PropertyCurrent y DemandCurrent.
 *
 * 1. Extrae keyagente de PropertySnapshot.raw existentes
 * 2. Mapea al Comercial (por nombre actual del agente)
 * 3. Setea Comercial.inmovillaAgentId
 * 4. Rellena PropertyCurrent.comercialId
 * 5. Rellena DemandCurrent.comercialId
 *
 * Ejecución: npx tsx scripts/backfill-comercial-relations.ts [--dry-run]
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log(`\n=== Backfill Comercial Relations ${DRY_RUN ? "(DRY RUN)" : ""} ===\n`);

  // --- Paso 1: Descubrir keyagente desde PropertySnapshot.raw ---
  console.log("[1/5] Buscando keyagente en PropertySnapshot.raw...");

  const snapshots = await prisma.propertySnapshot.findMany({
    select: { codigo: true, agente: true, raw: true },
  });

  const keyagenteMap = new Map<number, Set<string>>();

  for (const snap of snapshots) {
    const raw = snap.raw as Record<string, unknown> | null;
    if (!raw) continue;

    const keyagente = raw.keyagente ?? raw.keyAgente;
    if (keyagente == null) continue;

    const num = typeof keyagente === "number" ? keyagente : parseInt(String(keyagente), 10);
    if (isNaN(num)) continue;

    const agente = (snap.agente || String(keyagente)).trim();
    if (!keyagenteMap.has(num)) keyagenteMap.set(num, new Set());
    keyagenteMap.get(num)!.add(agente);
  }

  console.log(`   Encontrados ${keyagenteMap.size} keyagente(s) distintos:`);
  for (const [key, names] of keyagenteMap) {
    console.log(`   keyagente=${key} → nombres: ${[...names].join(", ")}`);
  }

  // --- Paso 2: Mapear keyagente → Comercial ---
  console.log("\n[2/5] Mapeando keyagente a Comercial...");

  const comerciales = await prisma.comercial.findMany({
    where: { activo: true },
    select: { id: true, nombre: true, inmovillaAgentId: true },
  });

  console.log(`   Comerciales activos: ${comerciales.length}`);

  let mappedCount = 0;
  for (const [keyagente, nombres] of keyagenteMap) {
    const alreadyMapped = comerciales.find((c) => c.inmovillaAgentId === keyagente);
    if (alreadyMapped) {
      console.log(`   keyagente=${keyagente} ya mapeado a "${alreadyMapped.nombre}" (${alreadyMapped.id})`);
      mappedCount++;
      continue;
    }

    const match = comerciales.find((c) =>
      [...nombres].some(
        (n) => n.toLowerCase() === c.nombre.toLowerCase(),
      ),
    );

    if (!match) {
      const byIdString = comerciales.find((c) =>
        [...nombres].some((n) => n === String(keyagente)),
      );

      if (!byIdString) {
        console.log(`   ⚠ keyagente=${keyagente} (${[...nombres].join(", ")}) — sin match en Comercial`);
        continue;
      }
    }

    const target = match ?? comerciales[0];
    if (!target) continue;

    console.log(`   keyagente=${keyagente} → "${target.nombre}" (${target.id})`);

    if (!DRY_RUN) {
      await prisma.comercial.update({
        where: { id: target.id },
        data: { inmovillaAgentId: keyagente },
      });
    }
    mappedCount++;
  }

  console.log(`   Mapeados: ${mappedCount}/${keyagenteMap.size}`);

  // --- Paso 3: Refrescar comerciales con inmovillaAgentId ---
  const refreshed = await prisma.comercial.findMany({
    where: { activo: true },
    select: { id: true, nombre: true, inmovillaAgentId: true },
  });

  // --- Paso 4: Backfill PropertyCurrent.comercialId ---
  console.log("\n[3/5] Rellenando PropertyCurrent.comercialId...");

  const properties = await prisma.propertyCurrent.findMany({
    where: { comercialId: null },
    select: { codigo: true, agente: true },
  });

  let propUpdated = 0;
  for (const prop of properties) {
    const agente = prop.agente?.trim();
    if (!agente) continue;

    const asNum = parseInt(agente, 10);
    let comercial;

    if (!isNaN(asNum) && String(asNum) === agente) {
      comercial = refreshed.find((c) => c.inmovillaAgentId === asNum);
    }

    if (!comercial) {
      comercial = refreshed.find(
        (c) => c.nombre.toLowerCase() === agente.toLowerCase(),
      );
    }

    if (!comercial) continue;

    if (!DRY_RUN) {
      await prisma.propertyCurrent.update({
        where: { codigo: prop.codigo },
        data: {
          comercialId: comercial.id,
          agente: comercial.nombre,
        },
      });
    }
    propUpdated++;
  }

  console.log(`   Actualizadas: ${propUpdated}/${properties.length} propiedades`);

  // --- Paso 5: Backfill DemandCurrent.comercialId ---
  console.log("\n[4/5] Rellenando DemandCurrent.comercialId...");

  const demands = await prisma.demandCurrent.findMany({
    where: { comercialId: null },
    select: { codigo: true, agente: true },
  });

  let demUpdated = 0;
  for (const dem of demands) {
    const agente = dem.agente?.trim();
    if (!agente) continue;

    const comercial = refreshed.find(
      (c) => c.nombre.toLowerCase() === agente.toLowerCase(),
    );

    if (!comercial) continue;

    if (!DRY_RUN) {
      await prisma.demandCurrent.update({
        where: { codigo: dem.codigo },
        data: { comercialId: comercial.id },
      });
    }
    demUpdated++;
  }

  console.log(`   Actualizadas: ${demUpdated}/${demands.length} demandas`);

  // --- Resumen ---
  console.log("\n[5/5] Resumen:");
  console.log(`   keyagente(s) descubiertos: ${keyagenteMap.size}`);
  console.log(`   Comerciales mapeados: ${mappedCount}`);
  console.log(`   PropertyCurrent rellenados: ${propUpdated}`);
  console.log(`   DemandCurrent rellenados: ${demUpdated}`);
  if (DRY_RUN) console.log("\n   ⚠ DRY RUN — no se escribió nada en BD");
  console.log("");
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
