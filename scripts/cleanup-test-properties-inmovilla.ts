/**
 * Limpieza: marca como `nodisponible=true` + `prospecto=true` todas las
 * propiedades TEST-INT-* que existen en Inmovilla REST.
 *
 * Estas propiedades fueron creadas accidentalmente por el test de integración
 * `lib/inmovilla/rest/__tests__/integration.test.ts` sin cleanup. Están
 * disponibles en Inmovilla, por lo que el ingestion worker las re-importa
 * cada ciclo aunque se borren de la DB local.
 *
 * Después de este script se pueden borrar de properties_current, property_snapshots
 * y del event store con las queries SQL opcionales del final.
 *
 * Uso:
 *   npx tsx scripts/cleanup-test-properties-inmovilla.ts
 *   npx tsx scripts/cleanup-test-properties-inmovilla.ts --dry-run
 *
 * Requiere INMOVILLA_API_TOKEN en .env.
 */

import "dotenv/config";
import {
  createInmovillaRestClient,
  createProperty,
} from "@/lib/inmovilla/rest";
import type { PropiedadListadoItem } from "@/lib/inmovilla/rest/types";
import { prisma } from "@/lib/prisma";

const RATE_LIMIT_PAUSE_MS = 15_000;
const dryRun = process.argv.includes("--dry-run");

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const client = createInmovillaRestClient();

  console.log("Obteniendo listado de propiedades de Inmovilla...");
  const listado = await client.get<PropiedadListadoItem[]>("/propiedades/", {
    listado: true,
  });

  const testProps = listado.filter(
    (p) => typeof p.ref === "string" && p.ref.startsWith("TEST-INT-"),
  );

  console.log(
    `\nEncontradas ${testProps.length} propiedades TEST-INT-* en Inmovilla (de ${listado.length} total):\n`,
  );

  if (testProps.length === 0) {
    console.log("Nada que limpiar.");
    await prisma.$disconnect();
    return;
  }

  for (const p of testProps) {
    const available = p.nodisponible === false;
    const flag = available ? "ACTIVA (a desactivar)" : "ya nodisponible";
    console.log(
      `  · cod_ofer=${p.cod_ofer} ref=${p.ref} ${flag}`,
    );
  }

  const toDisable = testProps.filter((p) => p.nodisponible === false);

  if (toDisable.length === 0) {
    console.log("\nTodas ya están marcadas como nodisponible. Sin cambios en Inmovilla.");
  } else if (dryRun) {
    console.log(
      `\n--dry-run: se habrían desactivado ${toDisable.length} propiedades. Sin cambios.`,
    );
  } else {
    console.log(
      `\nDesactivando ${toDisable.length} propiedades en Inmovilla (${RATE_LIMIT_PAUSE_MS / 1000}s entre cada una)...\n`,
    );

    let ok = 0;
    let fail = 0;

    for (let i = 0; i < toDisable.length; i++) {
      const p = toDisable[i];
      try {
        console.log(
          `[${i + 1}/${toDisable.length}] Desactivando cod_ofer=${p.cod_ofer} ref=${p.ref}...`,
        );
        await createProperty(client, {
          ref: p.ref,
          keyacci: 1,
          key_tipo: 3399,
          key_loca: 368799,
          precioinmo: 100000,
          nodisponible: true,
          prospecto: true,
        });
        console.log(`  OK.`);
        ok++;
      } catch (err) {
        console.error(
          `  ERROR: ${err instanceof Error ? err.message : String(err)}`,
        );
        fail++;
      }

      if (i < toDisable.length - 1) {
        await delay(RATE_LIMIT_PAUSE_MS);
      }
    }

    console.log(
      `\nResultado Inmovilla: ${ok} desactivadas, ${fail} fallidas.`,
    );
  }

  const testCodes = testProps.map((p) => String(p.cod_ofer));

  console.log("\nLimpiando properties_current...");
  const deletedCurrent = await prisma.propertyCurrent.deleteMany({
    where: { codigo: { in: testCodes } },
  });
  console.log(`  Eliminadas ${deletedCurrent.count} filas de properties_current.`);

  console.log("Limpiando property_snapshots...");
  const deletedSnapshots = await prisma.propertySnapshot.deleteMany({
    where: { codigo: { in: testCodes } },
  });
  console.log(`  Eliminadas ${deletedSnapshots.count} filas de property_snapshots.`);

  console.log("Limpiando eventos del event store...");
  const deletedEvents = await prisma.event.deleteMany({
    where: {
      aggregateType: "PROPERTY",
      aggregateId: { in: testCodes },
    },
  });
  console.log(`  Eliminados ${deletedEvents.count} eventos.`);

  console.log("Limpiando jobs vinculados a eventos de test...");
  if (deletedEvents.count > 0) {
    const orphanJobs = await prisma.job.deleteMany({
      where: {
        sourceEventId: {
          in: (
            await prisma.event.findMany({
              where: {
                aggregateType: "PROPERTY",
                aggregateId: { in: testCodes },
              },
              select: { id: true },
            })
          ).map((e) => e.id),
        },
      },
    });
    console.log(`  Eliminados ${orphanJobs.count} jobs.`);
  } else {
    console.log(`  No había eventos, nada que limpiar.`);
  }

  console.log("\nLimpieza completada.");
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Error fatal:", err instanceof Error ? err.message : err);
  await prisma.$disconnect();
  process.exit(1);
});
