/**
 * Importa el catálogo de zonas de Córdoba (Fase A) desde CSV v1.1.
 *
 * Uso:
 *   npm run market-zones:import -- --dry-run
 *   npm run market-zones:import
 *   npm run market-zones:import -- --file data/market-zones-result/inmovilla_cordoba_zone_validation_224499_v1_tipado.csv --catalog-version v1.1
 */

import "dotenv/config";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { prisma } from "../lib/prisma";
import {
  buildCatalogFromCsv,
  importCatalogToDatabase,
} from "../lib/market-zones/catalog-import";

const DEFAULT_FILE = "data/market-zones-result/inmovilla_cordoba_zone_validation_224499_v1_tipado.csv";
const DEFAULT_VERSION = "v1.1";

type Args = {
  file: string;
  catalogVersion: string;
  dryRun: boolean;
};

function parseArgs(argv: string[]): Args {
  let file = DEFAULT_FILE;
  let catalogVersion = DEFAULT_VERSION;
  const dryRun = argv.includes("--dry-run");

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--file" && argv[i + 1]) {
      file = argv[++i];
    } else if (arg.startsWith("--file=")) {
      file = arg.slice("--file=".length);
    } else if (arg === "--catalog-version" && argv[i + 1]) {
      catalogVersion = argv[++i];
    } else if (arg.startsWith("--catalog-version=")) {
      catalogVersion = arg.slice("--catalog-version=".length);
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Uso:
  npx tsx --env-file=.env scripts/import-market-zones-cordoba.ts [opciones]

Opciones:
  --file <path>             CSV fuente (default: ${DEFAULT_FILE})
  --catalog-version <value> Version lógica del catálogo (default: ${DEFAULT_VERSION})
  --dry-run                 No escribe en DB; solo valida y muestra resumen
`);
      process.exit(0);
    }
  }

  return { file, catalogVersion, dryRun };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const csvPath = path.resolve(process.cwd(), args.file);

  console.log(`[market-zones:import] archivo=${csvPath}`);
  console.log(`[market-zones:import] catalogVersion=${args.catalogVersion} mode=${args.dryRun ? "DRY-RUN" : "WRITE"}`);

  const content = await readFile(csvPath, "utf8");
  const build = buildCatalogFromCsv(content);

  const errors = build.issues.filter((issue) => issue.severity === "error");
  const warnings = build.issues.filter((issue) => issue.severity === "warning");

  console.log(`[market-zones:import] filas=${build.summary.totalRows} activas=${build.summary.activeRows} ready=${build.summary.readyRows} heuristic=${build.summary.heuristicRows}`);
  console.log(`[market-zones:import] relaciones_normalizadas=${build.relations.length} aliases=${build.aliases.length}`);
  console.log(`[market-zones:import] validacion: warnings=${warnings.length} errors=${errors.length}`);

  if (warnings.length > 0) {
    for (const warning of warnings.slice(0, 20)) {
      console.warn(
        `[market-zones:import] WARNING row=${warning.rowNumber} zone=${warning.zoneCode ?? "-"} :: ${warning.message}`,
      );
    }
    if (warnings.length > 20) {
      console.warn(`[market-zones:import] ... ${warnings.length - 20} warnings adicionales`);
    }
  }

  if (errors.length > 0) {
    for (const error of errors.slice(0, 40)) {
      console.error(
        `[market-zones:import] ERROR row=${error.rowNumber} zone=${error.zoneCode ?? "-"} :: ${error.message}`,
      );
    }
    if (errors.length > 40) {
      console.error(`[market-zones:import] ... ${errors.length - 40} errores adicionales`);
    }
    throw new Error(`[market-zones:import] Validación fallida: ${errors.length} errores`);
  }

  const imported = await importCatalogToDatabase({
    prisma,
    catalogVersion: args.catalogVersion,
    rows: build.rows,
    relations: build.relations,
    aliases: build.aliases,
    dryRun: args.dryRun,
  });

  console.log(
    `[market-zones:import] OK profiles=${imported.upsertedProfiles} relations=${imported.writtenRelations} aliases=${imported.writtenAliases}`,
  );
}

main()
  .catch((error) => {
    console.error("[market-zones:import] fallo fatal:", error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
