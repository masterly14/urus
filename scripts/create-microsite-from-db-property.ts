/**
 * Crea un microsite de prueba usando una propiedad ya existente en DB (properties_current).
 *
 * Uso:
 *   npx tsx scripts/create-microsite-from-db-property.ts
 *   npx tsx scripts/create-microsite-from-db-property.ts --property PROP-123
 *   npx tsx scripts/create-microsite-from-db-property.ts --property PROP-123 --status PENDING_VALIDATION
 *
 * Resultado:
 *   - Inserta un registro en microsite_selections con 1 propiedad curada desde DB.
 *   - Imprime URL pública del comprador.
 */

import "dotenv/config";
import { randomBytes } from "crypto";
import { prisma } from "../lib/prisma";
import { getPublicAppUrl } from "../lib/microsite/app-url";
import type { MicrositeCuratedProperty } from "../lib/microsite/selection";

type CliArgs = {
  propertyCode?: string;
  status: "APPROVED" | "PENDING_VALIDATION";
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { status: "PENDING_VALIDATION" };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--property") {
      args.propertyCode = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--status") {
      const raw = (argv[i + 1] ?? "").toUpperCase();
      if (raw === "APPROVED" || raw === "PENDING_VALIDATION") {
        args.status = raw;
      }
      i += 1;
    }
  }
  return args;
}

function token(): string {
  return randomBytes(16).toString("hex");
}

function toMicrositeProperty(p: {
  codigo: string;
  titulo: string;
  precio: number;
  metrosConstruidos: number;
  habitaciones: number;
  banyos: number;
  ciudad: string;
  zona: string;
  tipoOfer: string;
}): MicrositeCuratedProperty {
  return {
    propertyId: p.codigo,
    title: p.titulo?.trim() || `Propiedad ${p.codigo}`,
    description:
      `Propiedad de prueba generada desde DB (properties_current). ` +
      `Tipo: ${p.tipoOfer || "N/D"}. Ciudad: ${p.ciudad || "N/D"}. Zona: ${p.zona || "N/D"}.`,
    contactPhones: [],
    link: null,
    price: Number.isFinite(p.precio) ? p.precio : null,
    pricePerMeter:
      Number.isFinite(p.precio) && Number.isFinite(p.metrosConstruidos) && p.metrosConstruidos > 0
        ? Math.round(p.precio / p.metrosConstruidos)
        : null,
    metersBuilt: Number.isFinite(p.metrosConstruidos) ? p.metrosConstruidos : null,
    metersUsable: null,
    metersPlot: null,
    metersTerrace: null,
    rooms: Number.isFinite(p.habitaciones) ? p.habitaciones : null,
    baths: Number.isFinite(p.banyos) ? p.banyos : null,
    floor: null,
    orientation: null,
    address: null,
    city: p.ciudad || null,
    zone: p.zona || null,
    housing: p.tipoOfer || null,
    latitude: null,
    longitude: null,
    images: [],
    extras: ["Demo DB"],
    energyCertRating: null,
    energyCertValue: null,
    yearBuilt: null,
    condition: null,
    advertiserType: null,
    advertiserName: null,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const baseProperty = args.propertyCode
    ? await prisma.propertyCurrent.findUnique({
        where: { codigo: args.propertyCode },
        select: {
          codigo: true,
          titulo: true,
          precio: true,
          metrosConstruidos: true,
          habitaciones: true,
          banyos: true,
          ciudad: true,
          zona: true,
          tipoOfer: true,
          comercialId: true,
        },
      })
    : await prisma.propertyCurrent.findFirst({
        where: { nodisponible: false },
        orderBy: { updatedAt: "desc" },
        select: {
          codigo: true,
          titulo: true,
          precio: true,
          metrosConstruidos: true,
          habitaciones: true,
          banyos: true,
          ciudad: true,
          zona: true,
          tipoOfer: true,
          comercialId: true,
        },
      });

  if (!baseProperty) {
    console.error(
      "[create-microsite-from-db-property] No hay propiedades en properties_current o no existe el código indicado.",
    );
    process.exit(1);
  }

  const created = await prisma.micrositeSelection.create({
    data: {
      token: token(),
      status: args.status,
      demandId: `DEMO-${baseProperty.codigo}`,
      demandNombre: `Demo DB ${baseProperty.codigo}`,
      comercialId: baseProperty.comercialId ?? "system",
      statefoxQuery: { source: "db-property-test", propertyCode: baseProperty.codigo },
      resultFilters: { mode: "manual-db" },
      properties: [toMicrositeProperty(baseProperty)] as unknown as object,
      stockCount: 1,
      buyerPhone: "34600000000",
    },
    select: {
      id: true,
      token: true,
      status: true,
      demandId: true,
    },
  });

  const base = getPublicAppUrl();
  const buyerUrl = `${base}/seleccion/${created.token}`;

  console.log("\n=== Microsite de prueba creado ===");
  console.log(`selectionId:    ${created.id}`);
  console.log(`status:         ${created.status}`);
  console.log(`demandId:       ${created.demandId}`);
  console.log(`buyerUrl:       ${buyerUrl}`);
  console.log(`propertyCode:   ${baseProperty.codigo}`);
  console.log("\nTip: usa --status APPROVED si quieres abrir buyerUrl directamente.");
}

main()
  .catch((err) => {
    console.error("[create-microsite-from-db-property] Error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
