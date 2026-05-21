/**
 * Exporta un CSV semilla de zonas a partir de propiedades activas en Urus.
 *
 * Objetivo:
 * - Dar un punto de partida real al equipo de datos para `market_zone_profile`.
 * - Incluir zonas observadas en inventario, aliases detectados y metricas basicas.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/export-zone-profile-seed.ts
 *   npx tsx --env-file=.env scripts/export-zone-profile-seed.ts --city "Cordoba" --output-dir "data/market-zones"
 */

import "dotenv/config";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { prisma } from "../lib/prisma";

type Args = {
  city: string;
  outputDir: string;
};

type PropertyRow = {
  codigo: string;
  ciudad: string;
  zona: string;
  precio: number;
  metrosConstruidos: number;
  tipoOfer: string;
};

type ZoneAggregate = {
  normalizedKey: string;
  cityDisplay: string;
  zoneDisplay: string;
  rawZoneVariants: Set<string>;
  propertyCodes: string[];
  pricePerM2Values: number[];
  sizeValues: number[];
  tipos: Map<string, number>;
};

function parseArgs(): Args {
  const args = process.argv.slice(2);
  let city = "Cordoba";
  let outputDir = "data/market-zones";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--city" && args[i + 1]) {
      city = args[++i];
    } else if (args[i] === "--output-dir" && args[i + 1]) {
      outputDir = args[++i];
    }
  }

  return { city, outputDir };
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function matchesCity(value: string, targetCity: string): boolean {
  return normalizeText(value).includes(normalizeText(targetCity));
}

function normalizeZoneForKey(zone: string): string {
  return normalizeText(zone)
    .replace(/[.,;:()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

function modeFromMap(countByValue: Map<string, number>): string {
  let best = "";
  let bestCount = -1;
  for (const [value, count] of countByValue) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function topN(values: string[], n: number): string[] {
  return values.slice(0, n);
}

async function loadActiveProperties(): Promise<PropertyRow[]> {
  return prisma.propertyCurrent.findMany({
    where: {
      nodisponible: false,
      prospecto: false,
    },
    select: {
      codigo: true,
      ciudad: true,
      zona: true,
      precio: true,
      metrosConstruidos: true,
      tipoOfer: true,
    },
    orderBy: { codigo: "asc" },
  });
}

async function main() {
  const { city, outputDir } = parseArgs();
  const now = new Date().toISOString();

  console.log(`[zones-seed] Cargando propiedades activas (city filter: ${city})...`);
  const all = await loadActiveProperties();
  const filtered = all.filter(
    (p) =>
      Boolean(p.ciudad?.trim()) &&
      Boolean(p.zona?.trim()) &&
      matchesCity(p.ciudad, city),
  );

  if (filtered.length === 0) {
    console.error(`[zones-seed] No se encontraron propiedades activas para ciudad="${city}".`);
    process.exit(1);
  }

  const zoneMap = new Map<string, ZoneAggregate>();

  for (const p of filtered) {
    const zoneKey = normalizeZoneForKey(p.zona);
    if (!zoneKey) continue;

    if (!zoneMap.has(zoneKey)) {
      zoneMap.set(zoneKey, {
        normalizedKey: zoneKey,
        cityDisplay: p.ciudad.trim(),
        zoneDisplay: p.zona.trim(),
        rawZoneVariants: new Set<string>(),
        propertyCodes: [],
        pricePerM2Values: [],
        sizeValues: [],
        tipos: new Map<string, number>(),
      });
    }

    const agg = zoneMap.get(zoneKey)!;
    agg.rawZoneVariants.add(p.zona.trim());
    agg.propertyCodes.push(p.codigo);

    if (p.precio > 0 && p.metrosConstruidos > 0) {
      agg.pricePerM2Values.push(Math.round(p.precio / p.metrosConstruidos));
    }
    if (p.metrosConstruidos > 0) {
      agg.sizeValues.push(p.metrosConstruidos);
    }

    const tipo = (p.tipoOfer ?? "").trim() || "unknown";
    agg.tipos.set(tipo, (agg.tipos.get(tipo) ?? 0) + 1);
  }

  const zones = Array.from(zoneMap.values()).sort((a, b) =>
    a.zoneDisplay.localeCompare(b.zoneDisplay, "es"),
  );

  const headers = [
    "city",
    "zone_code",
    "zone_name",
    "aliases_portals_json",
    "aliases_internal_json",
    "aliases_typos_json",
    "market_segment",
    "quality_profile",
    "demand_level",
    "liquidity_level",
    "price_band_m2_min",
    "price_band_m2_max",
    "dominant_housing_types_json",
    "building_age_profile",
    "unit_size_min",
    "unit_size_max",
    "amenities_profile_json",
    "comparable_radius_mode",
    "source_quality",
    "owner_team",
    "last_validated_at",
    "is_active",
    "inventory_count",
    "avg_price_m2",
    "median_price_m2",
    "sample_property_codes_json",
    "notes",
  ];

  const rows: string[] = [headers.join(",")];

  zones.forEach((zone, idx) => {
    const zoneCode = `COR-${String(idx + 1).padStart(3, "0")}`;
    const aliases = Array.from(zone.rawZoneVariants).sort((a, b) => a.localeCompare(b, "es"));
    const avgPriceM2 =
      zone.pricePerM2Values.length > 0
        ? Math.round(
            zone.pricePerM2Values.reduce((sum, v) => sum + v, 0) /
              zone.pricePerM2Values.length,
          )
        : 0;
    const minPriceM2 =
      zone.pricePerM2Values.length > 0 ? Math.min(...zone.pricePerM2Values) : 0;
    const maxPriceM2 =
      zone.pricePerM2Values.length > 0 ? Math.max(...zone.pricePerM2Values) : 0;
    const medPriceM2 = median(zone.pricePerM2Values);
    const unitSizeMin = zone.sizeValues.length > 0 ? Math.min(...zone.sizeValues) : 0;
    const unitSizeMax = zone.sizeValues.length > 0 ? Math.max(...zone.sizeValues) : 0;
    const dominantType = modeFromMap(zone.tipos);

    const values = [
      zone.cityDisplay,
      zoneCode,
      zone.zoneDisplay,
      JSON.stringify(aliases),
      JSON.stringify(aliases),
      JSON.stringify([]),
      "",
      "",
      "",
      "",
      minPriceM2 > 0 ? String(minPriceM2) : "",
      maxPriceM2 > 0 ? String(maxPriceM2) : "",
      dominantType && dominantType !== "unknown" ? JSON.stringify([dominantType]) : JSON.stringify([]),
      "",
      unitSizeMin > 0 ? String(unitSizeMin) : "",
      unitSizeMax > 0 ? String(unitSizeMax) : "",
      JSON.stringify([]),
      "zone_plus_mirrors",
      "seed_from_inventory",
      "",
      "",
      "true",
      String(zone.propertyCodes.length),
      avgPriceM2 > 0 ? String(avgPriceM2) : "",
      medPriceM2 > 0 ? String(medPriceM2) : "",
      JSON.stringify(topN(zone.propertyCodes, 10)),
      `Seed generado automaticamente desde PropertyCurrent (${now}).`,
    ];

    rows.push(values.map(csvEscape).join(","));
  });

  await mkdir(outputDir, { recursive: true });
  const citySlug = normalizeText(city).replace(/\s+/g, "-");
  const csvPath = path.join(outputDir, `market_zone_profile.seed.${citySlug}.csv`);

  await writeFile(csvPath, `${rows.join("\n")}\n`, "utf8");

  console.log(`[zones-seed] Propiedades activas filtradas: ${filtered.length}`);
  console.log(`[zones-seed] Zonas detectadas: ${zones.length}`);
  console.log(`[zones-seed] CSV generado: ${csvPath}`);
}

main()
  .catch((err) => {
    console.error("[zones-seed] Error fatal:", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

