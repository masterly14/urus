/**
 * Backfill: asignar PropertyCurrent y DemandCurrent al Comercial correcto
 * según el código de ref de Inmovilla (patrón URUS{num}{V|A}{iniciales}).
 *
 * Usa Comercial.inmovillaRefCode (el que el CEO indica al invitar, ej. "MA")
 * y compara con extractRefCode(ref) de cada fila proyectada.
 *
 * Uso:
 *   npx tsx scripts/backfill-comercial-ref-assignments.ts --ref-code MA
 *   npx tsx scripts/backfill-comercial-ref-assignments.ts --ref-code MA --dry-run
 *   npx tsx scripts/backfill-comercial-ref-assignments.ts
 *     (procesa todos los comerciales activos con inmovillaRefCode definido)
 *
 * Opciones:
 *   --ref-code <CODE>  Solo ese código (mayúsculas/minúsculas indistinto)
 *   --dry-run          No escribe en BD
 *   --force            Sobrescribe comercialId si ya estaba asignado a otro
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { extractRefCode } from "../lib/routing/parse-ref-code";

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i === -1 || !process.argv[i + 1]) return null;
  return process.argv[i + 1].trim();
}

const REF_CODE_ARG = argValue("--ref-code");

async function main() {
  console.log(
    `\n=== Backfill asignaciones por ref Inmovilla ${DRY_RUN ? "(DRY RUN)" : ""} ===\n`,
  );

  const whereComercial =
    REF_CODE_ARG != null && REF_CODE_ARG.length > 0
      ? {
          activo: true,
          inmovillaRefCode: {
            equals: REF_CODE_ARG.trim(),
            mode: "insensitive" as const,
          },
        }
      : { activo: true, inmovillaRefCode: { not: null } };

  const comerciales = await prisma.comercial.findMany({
    where: whereComercial,
    select: { id: true, nombre: true, inmovillaRefCode: true },
  });

  if (comerciales.length === 0) {
    console.error(
      REF_CODE_ARG
        ? `No hay comercial activo con inmovillaRefCode="${REF_CODE_ARG}".`
        : "No hay comerciales activos con inmovillaRefCode definido.",
    );
    process.exit(1);
  }

  const props = await prisma.propertyCurrent.findMany({
    select: { codigo: true, ref: true, comercialId: true, agente: true },
  });
  const demands = await prisma.demandCurrent.findMany({
    select: { codigo: true, ref: true, comercialId: true, agente: true },
  });

  for (const c of comerciales) {
    const code = (c.inmovillaRefCode ?? "").trim().toUpperCase();
    if (!code) continue;

    console.log(
      `\n--- Comercial "${c.nombre}" (${c.id}) inmovillaRefCode=${code} ---\n`,
    );

    let propMatch = 0;
    let propUpdated = 0;
    let propSkippedOther = 0;

    for (const p of props) {
      const extracted = extractRefCode(p.ref);
      if (extracted !== code) continue;
      propMatch++;

      if (p.comercialId === c.id) {
        continue;
      }
      if (p.comercialId && !FORCE) {
        console.log(
          `   propiedad ${p.codigo} ref="${p.ref}" → ya asignada a otro comercial, omitir (usa --force)`,
        );
        propSkippedOther++;
        continue;
      }

      if (!DRY_RUN) {
        await prisma.propertyCurrent.update({
          where: { codigo: p.codigo },
          data: {
            comercialId: c.id,
            agente: c.nombre,
          },
        });
      }
      console.log(
        `   ${DRY_RUN ? "[dry-run] " : ""}propiedad ${p.codigo} ref="${p.ref}" → comercialId + agente`,
      );
      propUpdated++;
    }

    let demMatch = 0;
    let demUpdated = 0;
    let demSkippedOther = 0;

    for (const d of demands) {
      const extracted = extractRefCode(d.ref);
      if (extracted !== code) continue;
      demMatch++;

      if (d.comercialId === c.id) {
        continue;
      }
      if (d.comercialId && !FORCE) {
        console.log(
          `   demanda ${d.codigo} ref="${d.ref}" → ya asignada a otro comercial, omitir (usa --force)`,
        );
        demSkippedOther++;
        continue;
      }

      if (!DRY_RUN) {
        await prisma.demandCurrent.update({
          where: { codigo: d.codigo },
          data: {
            comercialId: c.id,
            agente: c.nombre,
          },
        });
      }
      console.log(
        `   ${DRY_RUN ? "[dry-run] " : ""}demanda ${d.codigo} ref="${d.ref}" → comercialId + agente`,
      );
      demUpdated++;
    }

    console.log(
      `\n   Resumen ref=${code}: propiedades coincidentes=${propMatch}, actualizadas=${propUpdated}, omitidas=${propSkippedOther}`,
    );
    console.log(
      `   Resumen ref=${code}: demandas coincidentes=${demMatch}, actualizadas=${demUpdated}, omitidas=${demSkippedOther}`,
    );
  }

  console.log("\n=== Fin ===\n");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
