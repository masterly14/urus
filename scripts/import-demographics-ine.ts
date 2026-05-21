import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";

interface DemographicCsvRow {
  city: string;
  districtCode: string;
  districtName: string;
  zoneCode: string | null;
  zoneName: string | null;
  population: number;
  surfaceKm2: number;
  densityPerKm2: number;
  year: number;
  source: string;
  geometryRef: string | null;
}

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    const [key, value] = token.replace(/^--/, "").split("=");
    args.set(key, value ?? "true");
  }
  return {
    file: args.get("file") ?? "data/demographics/ine_density.csv",
    dryRun: args.get("dry-run") === "true",
  };
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === "," && !quoted) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current);
  return values.map((item) => item.trim());
}

function normalizeHeader(header: string): string {
  return header
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function asNumber(raw: string | undefined, fallback = 0): number {
  if (!raw) return fallback;
  const normalized = raw.replace(/\./g, "").replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : fallback;
}

function bucketFromDensity(value: number): "baja" | "media" | "alta" | "muy_alta" {
  if (value < 2000) return "baja";
  if (value < 5000) return "media";
  if (value < 9000) return "alta";
  return "muy_alta";
}

function getCell(
  row: Record<string, string>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (value != null && value !== "") return value;
  }
  return undefined;
}

function toRow(cells: Record<string, string>): DemographicCsvRow {
  const city = getCell(cells, ["city", "ciudad"]) ?? "Cordoba";
  const districtCode =
    getCell(cells, ["district_code", "distrito_codigo", "districtcode"]) ?? "UNKNOWN";
  const districtName =
    getCell(cells, ["district_name", "distrito", "districtname"]) ?? "Sin distrito";
  const zoneCode =
    getCell(cells, ["zone_code", "zona_codigo", "zonecode"]) ?? null;
  const zoneName =
    getCell(cells, ["zone_name", "zona", "zonename"]) ?? null;
  const population = asNumber(getCell(cells, ["population", "poblacion"]));
  const surfaceKm2 = asNumber(getCell(cells, ["surface_km2", "superficie_km2", "surface"]));
  const densityPerKm2 = asNumber(
    getCell(cells, ["density_per_km2", "densidad_km2", "density"]),
  );
  const year = Math.round(asNumber(getCell(cells, ["year", "ano", "anio"]), new Date().getFullYear()));
  const source = getCell(cells, ["source", "fuente"]) ?? "INE";
  const geometryRef = getCell(cells, ["geometry_ref", "geometry", "geojson_ref"]) ?? null;

  return {
    city,
    districtCode,
    districtName,
    zoneCode,
    zoneName,
    population,
    surfaceKm2,
    densityPerKm2,
    year,
    source,
    geometryRef,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const absoluteFile = path.isAbsolute(args.file)
    ? args.file
    : path.resolve(process.cwd(), args.file);
  const content = await fs.readFile(absoluteFile, "utf8");
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) {
    throw new Error(`CSV sin datos útiles: ${absoluteFile}`);
  }

  const headers = splitCsvLine(lines[0]).map(normalizeHeader);
  const rows = lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const entry: Record<string, string> = {};
    headers.forEach((header, index) => {
      entry[header] = values[index] ?? "";
    });
    return toRow(entry);
  });

  console.log(
    `[demographics-import] leyendo=${absoluteFile} filas=${rows.length} dryRun=${args.dryRun}`,
  );
  if (args.dryRun) return;

  let upserted = 0;
  for (const row of rows) {
    await prisma.demographicZoneIndex.upsert({
      where: {
        city_districtCode_year: {
          city: row.city,
          districtCode: row.districtCode,
          year: row.year,
        },
      },
      create: {
        city: row.city,
        districtCode: row.districtCode,
        districtName: row.districtName,
        zoneCode: row.zoneCode,
        zoneName: row.zoneName,
        population: row.population,
        surfaceKm2: row.surfaceKm2,
        densityPerKm2: row.densityPerKm2,
        densityBucket: bucketFromDensity(row.densityPerKm2),
        year: row.year,
        source: row.source,
        geometryRef: row.geometryRef,
      },
      update: {
        districtName: row.districtName,
        zoneCode: row.zoneCode,
        zoneName: row.zoneName,
        population: row.population,
        surfaceKm2: row.surfaceKm2,
        densityPerKm2: row.densityPerKm2,
        densityBucket: bucketFromDensity(row.densityPerKm2),
        source: row.source,
        geometryRef: row.geometryRef,
        importedAt: new Date(),
      },
    });
    upserted += 1;
  }

  console.log(`[demographics-import] upserted=${upserted}`);
}

main()
  .catch((error) => {
    console.error("[demographics-import] error", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
