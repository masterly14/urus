/**
 * Backfill: enlazar Comercial con Inmovilla y rellenar
 * comercialId en PropertyCurrent y DemandCurrent.
 *
 * Estrategia de descubrimiento del agentId de Inmovilla:
 * 1. keyagente en raw (ingesta REST)
 * 2. captadopor en raw (ingesta legacy — suele coincidir con el gestor)
 * 3. Match directo por nombre (PropertyCurrent.agente ↔ Comercial.nombre)
 *
 * Ejecución: npx tsx scripts/backfill-comercial-relations.ts [--dry-run]
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log(
    `\n=== Backfill Comercial Relations ${DRY_RUN ? "(DRY RUN)" : ""} ===\n`,
  );

  // --- Paso 1: Descubrir IDs de agente desde PropertySnapshot.raw ---
  console.log("[1/5] Buscando IDs de agente en PropertySnapshot.raw...");

  const snapshots = await prisma.propertySnapshot.findMany({
    select: { codigo: true, agente: true, raw: true },
  });

  const agentIdMap = new Map<number, Set<string>>();

  for (const snap of snapshots) {
    const raw = snap.raw as Record<string, unknown> | null;
    if (!raw) continue;

    const candidates = [
      raw.keyagente,
      raw.keyAgente,
      raw.captadopor,
      raw.captadoPor,
    ];

    for (const candidate of candidates) {
      if (candidate == null) continue;
      const num =
        typeof candidate === "number"
          ? candidate
          : parseInt(String(candidate), 10);
      if (isNaN(num) || num === 0) continue;

      const agente = (snap.agente || "").trim();
      if (!agentIdMap.has(num)) agentIdMap.set(num, new Set());
      if (agente) agentIdMap.get(num)!.add(agente);
    }
  }

  console.log(`   Encontrados ${agentIdMap.size} ID(s) de agente distintos:`);
  for (const [key, names] of agentIdMap) {
    console.log(
      `   agentId=${key} → nombres asociados: ${[...names].join(", ") || "(sin nombre)"}`,
    );
  }

  // --- Paso 1b: Muestra de datos para debug ---
  console.log("\n[1b] Muestra de PropertyCurrent.agente (primeros 10):");
  const sampleProps = await prisma.propertyCurrent.findMany({
    select: { codigo: true, agente: true },
    take: 10,
  });
  for (const p of sampleProps) {
    console.log(`   ${p.codigo} → agente="${p.agente}"`);
  }

  const comerciales = await prisma.comercial.findMany({
    where: { activo: true },
    select: { id: true, nombre: true, inmovillaAgentId: true },
  });
  console.log(`\n   Comerciales activos: ${comerciales.length}`);
  for (const c of comerciales) {
    console.log(
      `   "${c.nombre}" (${c.id}) inmovillaAgentId=${c.inmovillaAgentId ?? "null"}`,
    );
  }

  // --- Paso 2: Mapear agentId → Comercial ---
  console.log("\n[2/5] Mapeando agentId a Comercial...");

  let mappedCount = 0;
  for (const [agentId, nombres] of agentIdMap) {
    const alreadyMapped = comerciales.find(
      (c) => c.inmovillaAgentId === agentId,
    );
    if (alreadyMapped) {
      console.log(
        `   agentId=${agentId} ya mapeado a "${alreadyMapped.nombre}"`,
      );
      mappedCount++;
      continue;
    }

    let match = comerciales.find((c) =>
      [...nombres].some((n) => n.toLowerCase() === c.nombre.toLowerCase()),
    );

    if (!match && comerciales.length === 1) {
      match = comerciales[0];
      console.log(
        `   agentId=${agentId} → asignado al único comercial "${match.nombre}" (1 solo comercial activo)`,
      );
    }

    if (!match) {
      console.log(
        `   ⚠ agentId=${agentId} (${[...nombres].join(", ")}) — sin match`,
      );
      continue;
    }

    if (!DRY_RUN) {
      try {
        await prisma.comercial.update({
          where: { id: match.id },
          data: { inmovillaAgentId: agentId },
        });
        console.log(
          `   ✓ agentId=${agentId} → "${match.nombre}" (guardado)`,
        );
      } catch (e) {
        console.log(
          `   ⚠ agentId=${agentId} — error al guardar: ${e instanceof Error ? e.message : e}`,
        );
      }
    } else {
      console.log(
        `   agentId=${agentId} → "${match.nombre}" (dry-run)`,
      );
    }
    mappedCount++;
  }

  console.log(`   Mapeados: ${mappedCount}/${agentIdMap.size}`);

  // --- Paso 3: Refrescar comerciales ---
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
    if (!agente) {
      if (refreshed.length === 1) {
        if (!DRY_RUN) {
          await prisma.propertyCurrent.update({
            where: { codigo: prop.codigo },
            data: {
              comercialId: refreshed[0].id,
              agente: refreshed[0].nombre,
            },
          });
        }
        propUpdated++;
      }
      continue;
    }

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

    if (!comercial && refreshed.length === 1) {
      comercial = refreshed[0];
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

  console.log(
    `   Actualizadas: ${propUpdated}/${properties.length} propiedades`,
  );

  // --- Paso 5: Backfill DemandCurrent.comercialId ---
  console.log("\n[4/5] Rellenando DemandCurrent.comercialId...");

  const demands = await prisma.demandCurrent.findMany({
    where: { comercialId: null },
    select: { codigo: true, agente: true },
  });

  let demUpdated = 0;
  for (const dem of demands) {
    const agente = dem.agente?.trim();

    let comercial;

    if (agente) {
      comercial = refreshed.find(
        (c) => c.nombre.toLowerCase() === agente.toLowerCase(),
      );
    }

    if (!comercial && refreshed.length === 1) {
      comercial = refreshed[0];
    }

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
  console.log(`   AgentId(s) descubiertos: ${agentIdMap.size}`);
  console.log(`   Comerciales mapeados (inmovillaAgentId): ${mappedCount}`);
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
