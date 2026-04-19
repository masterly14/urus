/**
 * Inventario de columnas `raw` (Prisma schema):
 * - property_snapshots.raw   (Json, default {})
 * - demand_snapshots.raw     (Json, default {})
 * - commercial_lead_facts.raw (Json?, opcional)
 *
 * Obtiene conteos y, opcionalmente, exporta todos los JSON no vacíos
 * (vacío = NULL, {}, o [] en PostgreSQL jsonb).
 *
 * Uso:
 *   npx tsx scripts/analyze-nonempty-raw.ts
 *   npx tsx scripts/analyze-nonempty-raw.ts --quiet
 *   npx tsx scripts/analyze-nonempty-raw.ts --print-limit 50
 *   npx tsx scripts/analyze-nonempty-raw.ts --export ./tmp/raw-export
 *   npx tsx scripts/analyze-nonempty-raw.ts --key-stats --key-stats-limit 500
 */

import "dotenv/config";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { prisma } from "../lib/prisma";

function parseArgs() {
  const argv = process.argv.slice(2);
  let exportDir: string | null = null;
  let keyStats = false;
  let keyStatsLimit = 500;
  let quiet = false;
  /** Máx. filas impresas por tabla (stdout); por defecto alto para volcar todo en dev. */
  let printLimitPerTable = 50_000;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--export" && argv[i + 1]) {
      exportDir = argv[++i];
    }
    if (argv[i] === "--key-stats") keyStats = true;
    if (argv[i] === "--key-stats-limit" && argv[i + 1]) {
      keyStatsLimit = Math.max(1, parseInt(argv[++i], 10) || 500);
    }
    if (argv[i] === "--quiet") quiet = true;
    if (argv[i] === "--print-limit" && argv[i + 1]) {
      printLimitPerTable = Math.max(1, parseInt(argv[++i], 10) || 50_000);
    }
  }
  return { exportDir, keyStats, keyStatsLimit, quiet, printLimitPerTable };
}

function topLevelKeys(j: unknown): string[] {
  if (j !== null && typeof j === "object" && !Array.isArray(j)) {
    return Object.keys(j as Record<string, unknown>).sort();
  }
  return [];
}

async function countNonEmptyPropertySnapshots(): Promise<number> {
  const r = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM property_snapshots
    WHERE "raw" IS NOT NULL
      AND "raw"::jsonb <> '{}'::jsonb
      AND "raw"::jsonb <> '[]'::jsonb
  `;
  return Number(r[0]?.count ?? 0);
}

async function countNonEmptyDemandSnapshots(): Promise<number> {
  const r = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM demand_snapshots
    WHERE "raw" IS NOT NULL
      AND "raw"::jsonb <> '{}'::jsonb
      AND "raw"::jsonb <> '[]'::jsonb
  `;
  return Number(r[0]?.count ?? 0);
}

async function countNonEmptyLeadFacts(): Promise<number> {
  const r = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM commercial_lead_facts
    WHERE "raw" IS NOT NULL
      AND "raw"::jsonb <> '{}'::jsonb
      AND "raw"::jsonb <> '[]'::jsonb
  `;
  return Number(r[0]?.count ?? 0);
}

const BATCH = 100;

async function printNonEmptyRawsForTable(params: {
  title: string;
  idLabel: string;
  limit: number;
  queryBatch: (
    take: number,
    offset: number,
  ) => Promise<{ id: string; raw: unknown }[]>;
  totalRows: number;
}): Promise<void> {
  const { title, idLabel, limit, queryBatch, totalRows } = params;
  console.log(`${title}`);
  if (totalRows === 0) {
    console.log("  (ninguno)\n");
    return;
  }
  let printed = 0;
  let offset = 0;
  while (printed < limit) {
    const take = Math.min(BATCH, limit - printed);
    const rows = await queryBatch(take, offset);
    if (rows.length === 0) break;
    let stopEarly = false;
    for (const row of rows) {
      if (printed >= limit) {
        stopEarly = true;
        break;
      }
      console.log(`\n--- ${idLabel}=${row.id} ---`);
      console.log(JSON.stringify(row.raw, null, 2));
      printed++;
    }
    offset += rows.length;
    if (rows.length < take || stopEarly) break;
  }
  if (printed < totalRows) {
    console.log(
      `\n  … ${totalRows - printed} fila(s) más no mostradas (usa --print-limit o --export).\n`,
    );
  } else {
    console.log("");
  }
}

async function main() {
  const { exportDir, keyStats, keyStatsLimit, quiet, printLimitPerTable } =
    parseArgs();

  console.log("\n=== Raw no vacíos (PostgreSQL jsonb) ===\n");
  console.log(
    "Criterio: raw IS NOT NULL y distinto de {} y de [].\n",
  );

  const [nProp, nDem, nLead] = await Promise.all([
    countNonEmptyPropertySnapshots(),
    countNonEmptyDemandSnapshots(),
    countNonEmptyLeadFacts(),
  ]);

  console.log(`property_snapshots (REST/ingesta propiedades): ${nProp} filas`);
  console.log(`demand_snapshots (ingesta demandas):           ${nDem} filas`);
  console.log(`commercial_lead_facts:                          ${nLead} filas`);
  console.log(`TOTAL:                                           ${nProp + nDem + nLead} filas\n`);

  if (!quiet) {
    console.log("=== Contenido raw (JSON) ===\n");

    await printNonEmptyRawsForTable({
      title: "property_snapshots",
      idLabel: "codigo",
      limit: printLimitPerTable,
      totalRows: nProp,
      queryBatch: (take, offset) =>
        prisma.$queryRaw<{ id: string; raw: unknown }[]>`
          SELECT "codigo" AS id, "raw" FROM property_snapshots
          WHERE "raw" IS NOT NULL
            AND "raw"::jsonb <> '{}'::jsonb
            AND "raw"::jsonb <> '[]'::jsonb
          ORDER BY "codigo"
          LIMIT ${take} OFFSET ${offset}
        `,
    });

    await printNonEmptyRawsForTable({
      title: "demand_snapshots",
      idLabel: "codigo",
      limit: printLimitPerTable,
      totalRows: nDem,
      queryBatch: (take, offset) =>
        prisma.$queryRaw<{ id: string; raw: unknown }[]>`
          SELECT "codigo" AS id, "raw" FROM demand_snapshots
          WHERE "raw" IS NOT NULL
            AND "raw"::jsonb <> '{}'::jsonb
            AND "raw"::jsonb <> '[]'::jsonb
          ORDER BY "codigo"
          LIMIT ${take} OFFSET ${offset}
        `,
    });

    await printNonEmptyRawsForTable({
      title: "commercial_lead_facts",
      idLabel: "leadId",
      limit: printLimitPerTable,
      totalRows: nLead,
      queryBatch: (take, offset) =>
        prisma.$queryRaw<{ id: string; raw: unknown }[]>`
          SELECT "leadId" AS id, "raw" FROM commercial_lead_facts
          WHERE "raw" IS NOT NULL
            AND "raw"::jsonb <> '{}'::jsonb
            AND "raw"::jsonb <> '[]'::jsonb
          ORDER BY "leadId"
          LIMIT ${take} OFFSET ${offset}
        `,
    });
  }

  if (keyStats && nProp + nDem > 0) {
    console.log(
      `--key-stats: muestreando hasta ${keyStatsLimit} filas por tabla de snapshots para frecuencia de claves de primer nivel\n`,
    );
    const keyFreq = new Map<string, number>();

    const sampleProps = await prisma.propertySnapshot.findMany({
      where: {
        NOT: {
          OR: [{ raw: { equals: {} } }, { raw: { equals: [] } }],
        },
      },
      select: { codigo: true, raw: true },
      take: keyStatsLimit,
      orderBy: { codigo: "asc" },
    });
    for (const row of sampleProps) {
      for (const k of topLevelKeys(row.raw)) {
        keyFreq.set(k, (keyFreq.get(k) ?? 0) + 1);
      }
    }

    const sampleDems = await prisma.demandSnapshot.findMany({
      where: {
        NOT: {
          OR: [{ raw: { equals: {} } }, { raw: { equals: [] } }],
        },
      },
      select: { codigo: true, raw: true },
      take: keyStatsLimit,
      orderBy: { codigo: "asc" },
    });
    for (const row of sampleDems) {
      for (const k of topLevelKeys(row.raw)) {
        keyFreq.set(`[demand] ${k}`, (keyFreq.get(`[demand] ${k}`) ?? 0) + 1);
      }
    }

    const sorted = [...keyFreq.entries()].sort((a, b) => b[1] - a[1]);
    console.log("Clave (primer nivel) → apariciones (en muestra):");
    for (const [k, v] of sorted.slice(0, 80)) {
      console.log(`  ${v}\t${k}`);
    }
    if (sorted.length > 80) {
      console.log(`  … y ${sorted.length - 80} claves más\n`);
    } else {
      console.log("");
    }
  }

  if (exportDir) {
    mkdirSync(exportDir, { recursive: true });
    const batchSize = 200;

    async function dumpPropertySnapshots() {
      const path = join(exportDir!, "property_snapshots.jsonl");
      const lines: string[] = [];
      let skip = 0;
      for (;;) {
        const batch = await prisma.propertySnapshot.findMany({
          where: {
            NOT: {
              OR: [{ raw: { equals: {} } }, { raw: { equals: [] } }],
            },
          },
          select: { codigo: true, raw: true },
          orderBy: { codigo: "asc" },
          take: batchSize,
          skip,
        });
        if (batch.length === 0) break;
        for (const row of batch) {
          lines.push(
            JSON.stringify({ table: "property_snapshots", id: row.codigo, raw: row.raw }),
          );
        }
        skip += batch.length;
      }
      writeFileSync(path, lines.join("\n") + (lines.length ? "\n" : ""), "utf8");
      console.log(`Exportado: ${path} (${lines.length} líneas)`);
    }

    async function dumpDemandSnapshots() {
      const path = join(exportDir!, "demand_snapshots.jsonl");
      const lines: string[] = [];
      let skip = 0;
      for (;;) {
        const batch = await prisma.demandSnapshot.findMany({
          where: {
            NOT: {
              OR: [{ raw: { equals: {} } }, { raw: { equals: [] } }],
            },
          },
          select: { codigo: true, raw: true },
          orderBy: { codigo: "asc" },
          take: batchSize,
          skip,
        });
        if (batch.length === 0) break;
        for (const row of batch) {
          lines.push(
            JSON.stringify({ table: "demand_snapshots", id: row.codigo, raw: row.raw }),
          );
        }
        skip += batch.length;
      }
      writeFileSync(path, lines.join("\n") + (lines.length ? "\n" : ""), "utf8");
      console.log(`Exportado: ${path} (${lines.length} líneas)`);
    }

    async function dumpLeadFacts() {
      const path = join(exportDir!, "commercial_lead_facts.jsonl");
      const lines: string[] = [];
      let offset = 0;
      for (;;) {
        const batch = await prisma.$queryRaw<{ leadId: string; raw: unknown }[]>`
          SELECT "leadId", "raw" FROM commercial_lead_facts
          WHERE "raw" IS NOT NULL
            AND "raw"::jsonb <> '{}'::jsonb
            AND "raw"::jsonb <> '[]'::jsonb
          ORDER BY "leadId"
          LIMIT ${batchSize} OFFSET ${offset}
        `;
        if (batch.length === 0) break;
        for (const row of batch) {
          lines.push(
            JSON.stringify({
              table: "commercial_lead_facts",
              id: row.leadId,
              raw: row.raw,
            }),
          );
        }
        offset += batchSize;
        if (batch.length < batchSize) break;
      }
      writeFileSync(path, lines.join("\n") + (lines.length ? "\n" : ""), "utf8");
      console.log(`Exportado: ${path} (${lines.length} líneas)`);
    }

    console.log(`\nExportando a ${exportDir} …\n`);
    await dumpPropertySnapshots();
    await dumpDemandSnapshots();
    await dumpLeadFacts();
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
