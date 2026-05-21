/**
 * Exporta una cola de validacion para las zonas comerciales de Cordoba
 * registradas en Inmovilla.
 *
 * Fuente base:
 * - inmovilla_enum_zona con key_loca=224499 (Cordoba)
 *
 * Cruces:
 * - properties_current para inventario activo real.
 * - property_snapshots para historico observado y raw.key_loca/raw.key_zona.
 *
 * Uso:
 *   npm run market-zones:export-validation
 *   npx tsx --env-file=.env scripts/export-inmovilla-cordoba-zone-validation.ts
 *   npx tsx --env-file=.env scripts/export-inmovilla-cordoba-zone-validation.ts --key-loca=224499 --output-dir=data/market-zones-result
 */

import "dotenv/config";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { prisma } from "../lib/prisma";

const DEFAULT_CORDOBA_KEY_LOCA = 224499;
const DEFAULT_OUTPUT_DIR = "data/market-zones-result";
const MAX_SAMPLE_CODES = 12;

type Args = {
  keyLoca: number;
  outputDir: string;
};

type RawLocation = {
  key_loca?: unknown;
  key_zona?: unknown;
  zona?: unknown;
};

type ZoneAggregate = {
  activePropertyCodes: string[];
  historicalPropertyCodes: string[];
  activePriceM2: number[];
  historicalPriceM2: number[];
  activeSizes: number[];
  historicalSizes: number[];
  activeTipos: Map<string, number>;
  historicalTipos: Map<string, number>;
  rawZoneVariants: Set<string>;
};

type ValidationRow = {
  priorityRank: number;
  validationPriority: "P1_active_inventory" | "P2_historical_inventory" | "P3_no_stock";
  keyLoca: number;
  keyZona: number;
  zonaInmovilla: string;
  suggestedZoneCode: string;
  inventoryCountActive: number;
  inventoryCountHistorical: number;
  avgPriceM2Active: number | "";
  medianPriceM2Active: number | "";
  avgPriceM2Historical: number | "";
  medianPriceM2Historical: number | "";
  unitSizeMinActive: number | "";
  unitSizeMaxActive: number | "";
  dominantTiposDetectedJson: string;
  sampleActivePropertyCodesJson: string;
  sampleHistoricalPropertyCodesJson: string;
  rawZoneVariantsJson: string;
};

function parseArgs(): Args {
  const args = process.argv.slice(2);
  let keyLoca = DEFAULT_CORDOBA_KEY_LOCA;
  let outputDir = DEFAULT_OUTPUT_DIR;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--key-loca" && args[i + 1]) {
      keyLoca = Number(args[++i]);
    } else if (arg.startsWith("--key-loca=")) {
      keyLoca = Number(arg.slice("--key-loca=".length));
    } else if (arg === "--output-dir" && args[i + 1]) {
      outputDir = args[++i];
    } else if (arg.startsWith("--output-dir=")) {
      outputDir = arg.slice("--output-dir=".length);
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Uso: npx tsx --env-file=.env scripts/export-inmovilla-cordoba-zone-validation.ts [opciones]

Opciones:
  --key-loca=N       key_loca de Inmovilla a exportar (default: 224499)
  --output-dir=DIR   Carpeta de salida (default: data/market-zones-result)
`);
      process.exit(0);
    }
  }

  if (!Number.isFinite(keyLoca) || keyLoca <= 0) {
    throw new Error(`--key-loca invalido: ${keyLoca}`);
  }

  return { keyLoca, outputDir };
}

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(",", ".").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseRawLocation(raw: unknown): RawLocation {
  return raw && typeof raw === "object" ? (raw as RawLocation) : {};
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function emptyAggregate(): ZoneAggregate {
  return {
    activePropertyCodes: [],
    historicalPropertyCodes: [],
    activePriceM2: [],
    historicalPriceM2: [],
    activeSizes: [],
    historicalSizes: [],
    activeTipos: new Map<string, number>(),
    historicalTipos: new Map<string, number>(),
    rawZoneVariants: new Set<string>(),
  };
}

function addCount(map: Map<string, number>, value: string): void {
  const key = value.trim() || "unknown";
  map.set(key, (map.get(key) ?? 0) + 1);
}

function sortedMapKeysByCount(map: Map<string, number>): string[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))
    .map(([key]) => key)
    .filter((key) => key !== "unknown");
}

function buildSampleJson(values: string[]): string {
  return JSON.stringify([...new Set(values)].slice(0, MAX_SAMPLE_CODES));
}

function priceM2(precio: number, metrosConstruidos: number): number | null {
  if (precio <= 0 || metrosConstruidos <= 0) return null;
  return Math.round(precio / metrosConstruidos);
}

function toOutputNumber(value: number): number | "" {
  return value > 0 ? value : "";
}

function validationPriority(aggregate: ZoneAggregate): ValidationRow["validationPriority"] {
  if (aggregate.activePropertyCodes.length > 0) return "P1_active_inventory";
  if (aggregate.historicalPropertyCodes.length > 0) return "P2_historical_inventory";
  return "P3_no_stock";
}

async function main() {
  const { keyLoca, outputDir } = parseArgs();

  console.log(`[market-zones-validation] Cargando zonas Inmovilla key_loca=${keyLoca}...`);

  const inmovillaZones = await prisma.inmovillaEnumZona.findMany({
    where: { key_loca: keyLoca },
    select: { key_loca: true, key_zona: true, zona: true },
    orderBy: [{ zona: "asc" }, { key_zona: "asc" }],
  });

  if (inmovillaZones.length === 0) {
    throw new Error(
      `No hay zonas Inmovilla para key_loca=${keyLoca}. Ejecuta npm run inmovilla:sync-enums o revisa el key_loca.`,
    );
  }

  const aggregates = new Map<number, ZoneAggregate>();
  for (const zone of inmovillaZones) {
    aggregates.set(zone.key_zona, emptyAggregate());
  }

  const activeProperties = await prisma.propertyCurrent.findMany({
    where: {
      nodisponible: false,
      prospecto: false,
    },
    select: {
      codigo: true,
      zona: true,
      precio: true,
      metrosConstruidos: true,
      tipoOfer: true,
    },
    orderBy: { codigo: "asc" },
  });

  const snapshots = await prisma.propertySnapshot.findMany({
    select: {
      codigo: true,
      zona: true,
      precio: true,
      metrosConstruidos: true,
      tipoOfer: true,
      raw: true,
    },
    orderBy: { codigo: "asc" },
  });

  const keyZonaByCode = new Map<string, number>();
  for (const snapshot of snapshots) {
    const raw = parseRawLocation(snapshot.raw);
    const rawKeyLoca = parseNumber(raw.key_loca);
    const rawKeyZona = parseNumber(raw.key_zona);
    if (rawKeyLoca === keyLoca && rawKeyZona != null && aggregates.has(rawKeyZona)) {
      keyZonaByCode.set(snapshot.codigo, rawKeyZona);
    }
  }

  const normalizedZoneNameToKeyZona = new Map<string, number>();
  for (const zone of inmovillaZones) {
    normalizedZoneNameToKeyZona.set(normalizeText(zone.zona), zone.key_zona);
  }

  for (const property of activeProperties) {
    const keyZona =
      keyZonaByCode.get(property.codigo) ??
      normalizedZoneNameToKeyZona.get(normalizeText(property.zona));
    if (keyZona == null) continue;

    const aggregate = aggregates.get(keyZona);
    if (!aggregate) continue;

    aggregate.activePropertyCodes.push(property.codigo);
    if (property.zona.trim()) aggregate.rawZoneVariants.add(property.zona.trim());
    const p2m = priceM2(property.precio, property.metrosConstruidos);
    if (p2m != null) aggregate.activePriceM2.push(p2m);
    if (property.metrosConstruidos > 0) aggregate.activeSizes.push(property.metrosConstruidos);
    addCount(aggregate.activeTipos, property.tipoOfer);
  }

  for (const snapshot of snapshots) {
    const keyZona =
      keyZonaByCode.get(snapshot.codigo) ??
      normalizedZoneNameToKeyZona.get(normalizeText(snapshot.zona));
    if (keyZona == null) continue;

    const aggregate = aggregates.get(keyZona);
    if (!aggregate) continue;

    aggregate.historicalPropertyCodes.push(snapshot.codigo);
    if (snapshot.zona.trim()) aggregate.rawZoneVariants.add(snapshot.zona.trim());
    const p2m = priceM2(snapshot.precio, snapshot.metrosConstruidos);
    if (p2m != null) aggregate.historicalPriceM2.push(p2m);
    if (snapshot.metrosConstruidos > 0) aggregate.historicalSizes.push(snapshot.metrosConstruidos);
    addCount(aggregate.historicalTipos, snapshot.tipoOfer);
  }

  const rows: ValidationRow[] = inmovillaZones.map((zone) => {
    const aggregate = aggregates.get(zone.key_zona) ?? emptyAggregate();
    const priority = validationPriority(aggregate);
    const dominantTipos = sortedMapKeysByCount(
      aggregate.activeTipos.size > 0 ? aggregate.activeTipos : aggregate.historicalTipos,
    );

    return {
      priorityRank: 0,
      validationPriority: priority,
      keyLoca: zone.key_loca,
      keyZona: zone.key_zona,
      zonaInmovilla: zone.zona,
      suggestedZoneCode: `COR-IMV-${String(zone.key_zona).padStart(4, "0")}`,
      inventoryCountActive: aggregate.activePropertyCodes.length,
      inventoryCountHistorical: aggregate.historicalPropertyCodes.length,
      avgPriceM2Active: toOutputNumber(average(aggregate.activePriceM2)),
      medianPriceM2Active: toOutputNumber(median(aggregate.activePriceM2)),
      avgPriceM2Historical: toOutputNumber(average(aggregate.historicalPriceM2)),
      medianPriceM2Historical: toOutputNumber(median(aggregate.historicalPriceM2)),
      unitSizeMinActive:
        aggregate.activeSizes.length > 0 ? Math.min(...aggregate.activeSizes) : "",
      unitSizeMaxActive:
        aggregate.activeSizes.length > 0 ? Math.max(...aggregate.activeSizes) : "",
      dominantTiposDetectedJson: JSON.stringify(dominantTipos),
      sampleActivePropertyCodesJson: buildSampleJson(aggregate.activePropertyCodes),
      sampleHistoricalPropertyCodesJson: buildSampleJson(aggregate.historicalPropertyCodes),
      rawZoneVariantsJson: JSON.stringify([...aggregate.rawZoneVariants].sort((a, b) => a.localeCompare(b, "es"))),
    };
  });

  rows.sort((a, b) => {
    const priorityOrder = {
      P1_active_inventory: 1,
      P2_historical_inventory: 2,
      P3_no_stock: 3,
    } satisfies Record<ValidationRow["validationPriority"], number>;

    return (
      priorityOrder[a.validationPriority] - priorityOrder[b.validationPriority] ||
      b.inventoryCountActive - a.inventoryCountActive ||
      b.inventoryCountHistorical - a.inventoryCountHistorical ||
      a.zonaInmovilla.localeCompare(b.zonaInmovilla, "es") ||
      a.keyZona - b.keyZona
    );
  });

  rows.forEach((row, idx) => {
    row.priorityRank = idx + 1;
  });

  const headers = [
    "priority_rank",
    "validation_priority",
    "key_loca",
    "key_zona",
    "zona_inmovilla",
    "suggested_zone_code",
    "coverage_status",
    "pricing_profile_status",
    "zone_name_canonical",
    "macro_area",
    "market_segment",
    "quality_profile",
    "demand_level",
    "liquidity_level",
    "price_band_m2_min",
    "price_band_m2_max",
    "dominant_housing_types_json",
    "building_age_profile",
    "amenities_profile_json",
    "comparable_radius_mode",
    "comparable_with_zone_codes_json",
    "not_comparable_with_zone_codes_json",
    "source_quality",
    "owner_team",
    "validated_by",
    "validated_at",
    "is_active",
    "redirect_to_zone_code",
    "inventory_count_active",
    "inventory_count_historical",
    "avg_price_m2_active",
    "median_price_m2_active",
    "avg_price_m2_historical",
    "median_price_m2_historical",
    "unit_size_min_active",
    "unit_size_max_active",
    "dominant_tipos_detected_json",
    "sample_active_property_codes_json",
    "sample_historical_property_codes_json",
    "raw_zone_variants_json",
    "notes",
  ];

  const csvRows = [headers.join(",")];
  const today = new Date().toISOString().slice(0, 10);

  for (const row of rows) {
    const values = [
      row.priorityRank,
      row.validationPriority,
      row.keyLoca,
      row.keyZona,
      row.zonaInmovilla,
      row.suggestedZoneCode,
      row.validationPriority === "P3_no_stock" ? "known_unprofiled" : "pending_review",
      "not_ready",
      row.zonaInmovilla,
      "",
      "",
      "",
      "",
      "",
      row.avgPriceM2Active || row.avgPriceM2Historical,
      row.avgPriceM2Active || row.avgPriceM2Historical,
      row.dominantTiposDetectedJson,
      "",
      JSON.stringify([]),
      "zone_plus_mirrors",
      JSON.stringify([]),
      JSON.stringify([]),
      "",
      "comercial_cordoba",
      "",
      "",
      "true",
      "",
      row.inventoryCountActive,
      row.inventoryCountHistorical,
      row.avgPriceM2Active,
      row.medianPriceM2Active,
      row.avgPriceM2Historical,
      row.medianPriceM2Historical,
      row.unitSizeMinActive,
      row.unitSizeMaxActive,
      row.dominantTiposDetectedJson,
      row.sampleActivePropertyCodesJson,
      row.sampleHistoricalPropertyCodesJson,
      row.rawZoneVariantsJson,
      `Export validacion ${today}. Equipo: completar campos vacios y relaciones antes de activar pricing avanzado.`,
    ];

    csvRows.push(values.map(csvEscape).join(","));
  }

  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `inmovilla_cordoba_zone_validation.${keyLoca}.csv`);
  await writeFile(outputPath, `${csvRows.join("\n")}\n`, "utf8");

  const p1 = rows.filter((row) => row.validationPriority === "P1_active_inventory").length;
  const p2 = rows.filter((row) => row.validationPriority === "P2_historical_inventory").length;
  const p3 = rows.filter((row) => row.validationPriority === "P3_no_stock").length;

  console.log(`[market-zones-validation] Zonas Inmovilla exportadas: ${rows.length}`);
  console.log(`[market-zones-validation] P1 con inventario activo: ${p1}`);
  console.log(`[market-zones-validation] P2 con historico: ${p2}`);
  console.log(`[market-zones-validation] P3 sin stock observado: ${p3}`);
  console.log(`[market-zones-validation] CSV generado: ${outputPath}`);
}

main()
  .catch((err) => {
    console.error("[market-zones-validation] Error fatal:", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
