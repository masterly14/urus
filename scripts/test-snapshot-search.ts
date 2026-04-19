/**
 * Validación E2E del nuevo motor de búsqueda snapshot para Statefox.
 *
 * Ejecuta varias demandas tipo contra la API real y muestra resultados.
 * Uso: npx tsx scripts/test-snapshot-search.ts
 */

import "dotenv/config";
import { searchSnapshotForDemand } from "../lib/statefox/snapshot-search";
import type { DemandFilterInput } from "../lib/statefox/query-builder";

const token = process.env.STATEFOX_BEARER_TOKEN;
if (!token) {
  console.error("[test] Falta STATEFOX_BEARER_TOKEN");
  process.exit(1);
}

interface TestCase {
  label: string;
  demand: DemandFilterInput;
}

const CASES: TestCase[] = [
  {
    label: "Piso en Córdoba, 100-200k€, 2+ hab",
    demand: {
      tipos: "Piso",
      zonas: "Córdoba",
      presupuestoMin: 100000,
      presupuestoMax: 200000,
      habitacionesMin: 2,
    },
  },
  {
    label: "Piso en Córdoba, sin filtro de precio",
    demand: {
      tipos: "Piso",
      zonas: "Córdoba",
      presupuestoMin: 0,
      presupuestoMax: 0,
      habitacionesMin: 0,
    },
  },
  {
    label: "Casa en Córdoba, hasta 300k€",
    demand: {
      tipos: "Casa",
      zonas: "Córdoba",
      presupuestoMin: 0,
      presupuestoMax: 300000,
      habitacionesMin: 3,
    },
  },
  {
    label: "Ático en Córdoba, 150-250k€",
    demand: {
      tipos: "Ático",
      zonas: "Córdoba",
      presupuestoMin: 150000,
      presupuestoMax: 250000,
      habitacionesMin: 0,
    },
  },
  {
    label: "Piso en Córdoba Centro, 80-150k€, 60-90m²",
    demand: {
      tipos: "Piso",
      zonas: "Córdoba, Centro",
      presupuestoMin: 80000,
      presupuestoMax: 150000,
      habitacionesMin: 2,
      metrosMin: 60,
      metrosMax: 90,
    },
  },
  {
    label: "Piso en Madrid (fuera de inventario — debería dar 0)",
    demand: {
      tipos: "Piso",
      zonas: "Madrid",
      presupuestoMin: 200000,
      presupuestoMax: 400000,
      habitacionesMin: 2,
    },
  },
];

async function main() {
  console.log("\n=== TEST SNAPSHOT SEARCH ENGINE ===\n");

  for (const tc of CASES) {
    console.log(`--- ${tc.label} ---`);
    const start = Date.now();

    try {
      const result = await searchSnapshotForDemand(tc.demand, {
        maxPages: 10,
        targetResults: 20,
        listingType: "sale",
      });

      const elapsed = Date.now() - start;

      console.log(`  Resultados : ${result.properties.length}`);
      console.log(`  Escaneados : ${result.totalScanned}`);
      console.log(`  Páginas    : ${result.pagesScanned}`);
      console.log(`  Early exit : ${result.earlyExit}`);
      console.log(`  Latencia   : ${elapsed}ms`);

      if (result.properties.length > 0) {
        const sample = result.properties.slice(0, 3);
        for (const m of sample) {
          const p = m.property;
          console.log(
            `    ${m.id} | ${p.pCity?.cityName ?? "?"} | ${p.pHousing ?? "?"} | ${p.pPrice ?? "?"}€ | ${p.pMeters?.built ?? "?"}m² | ${p.pRooms ?? "?"} hab`,
          );
        }
        if (result.properties.length > 3) {
          console.log(`    ... y ${result.properties.length - 3} más`);
        }
      }
    } catch (err) {
      console.log(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
    }

    console.log();
  }

  console.log("=== FIN ===\n");
}

main().catch((err) => {
  console.error("[test] Error fatal:", err.message ?? err);
  process.exit(1);
});
