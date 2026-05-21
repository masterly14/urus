/**
 * Exporta un CSV "zona -> propiedades" desde PropertyCurrent.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/export-zone-property-map.ts
 *   npx tsx --env-file=.env scripts/export-zone-property-map.ts --city "Cordoba" --output-dir "data/market-zones"
 */

import "dotenv/config";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { prisma } from "../lib/prisma";

type Args = {
  city: string;
  outputDir: string;
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

async function main() {
  const { city, outputDir } = parseArgs();

  const rows = await prisma.propertyCurrent.findMany({
    where: {
      nodisponible: false,
      prospecto: false,
    },
    select: {
      codigo: true,
      ref: true,
      titulo: true,
      ciudad: true,
      zona: true,
      precio: true,
      metrosConstruidos: true,
      tipoOfer: true,
      estado: true,
      agente: true,
      comercialId: true,
      fechaAlta: true,
      fechaActualizacion: true,
      numFotos: true,
      mainPhotoUrl: true,
      portalName: true,
      portalUrl: true,
    },
    orderBy: [{ zona: "asc" }, { codigo: "asc" }],
  });

  const filtered = rows.filter(
    (p) =>
      Boolean(p.ciudad?.trim()) &&
      Boolean(p.zona?.trim()) &&
      matchesCity(p.ciudad, city),
  );

  if (filtered.length === 0) {
    console.error(`[zone-property-map] No se encontraron propiedades activas para ciudad="${city}".`);
    process.exit(1);
  }

  const headers = [
    "city",
    "zone_raw",
    "zone_normalized_key",
    "property_code",
    "property_ref",
    "property_title",
    "price",
    "metros_construidos",
    "price_m2",
    "tipo_ofer",
    "estado",
    "agente",
    "comercial_id",
    "fecha_alta",
    "fecha_actualizacion",
    "num_fotos",
    "main_photo_url",
    "portal_name",
    "portal_url",
  ];

  const csvRows: string[] = [headers.join(",")];

  for (const p of filtered) {
    const priceM2 =
      p.precio > 0 && p.metrosConstruidos > 0
        ? Math.round(p.precio / p.metrosConstruidos)
        : "";

    const values = [
      p.ciudad,
      p.zona,
      normalizeZoneForKey(p.zona),
      p.codigo,
      p.ref,
      p.titulo,
      p.precio,
      p.metrosConstruidos,
      priceM2,
      p.tipoOfer,
      p.estado,
      p.agente,
      p.comercialId ?? "",
      p.fechaAlta ?? "",
      p.fechaActualizacion ?? "",
      p.numFotos,
      p.mainPhotoUrl ?? "",
      p.portalName ?? "",
      p.portalUrl ?? "",
    ];

    csvRows.push(values.map(csvEscape).join(","));
  }

  await mkdir(outputDir, { recursive: true });
  const citySlug = normalizeText(city).replace(/\s+/g, "-");
  const outputPath = path.join(outputDir, `property_current.zone-map.${citySlug}.csv`);

  await writeFile(outputPath, `${csvRows.join("\n")}\n`, "utf8");

  console.log(`[zone-property-map] Propiedades exportadas: ${filtered.length}`);
  console.log(`[zone-property-map] CSV generado: ${outputPath}`);
}

main()
  .catch((err) => {
    console.error("[zone-property-map] Error fatal:", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

