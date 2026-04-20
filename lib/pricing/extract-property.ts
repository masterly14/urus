/**
 * Extracción de variables del inmueble desde Neon para el Motor de Pricing.
 *
 * Lee PropertyCurrent + PropertySnapshot (raw JSON) y resuelve la tipología
 * desde el catálogo InmovillaEnumTipo (key_tipo numérico → nombre textual).
 */

import { prisma } from "@/lib/prisma";
import { getNombreTipoByKeyTipo } from "@/lib/inmovilla/rest/catalogs";
import type { PricingPropertyInput, PricingPropertyExtras } from "./types";
import { PricingDataIncompleteError, PricingNotEligibleError } from "./types";

function parseBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1;
  if (typeof v === "string") return v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "si";
  return false;
}

function parseStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function normalizeForComparison(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function isCordobaCity(ciudad: string): boolean {
  const normalized = normalizeForComparison(ciudad);
  // Acepta "Córdoba", "Cordoba" y variantes como "Córdoba capital".
  return normalized.includes("cordoba");
}

/**
 * Extrae extras del inmueble desde el JSON raw de PropertySnapshot.
 * Los campos de Inmovilla varían; se extraen los más comunes.
 */
function extractExtras(raw: Record<string, unknown>): PricingPropertyExtras {
  return {
    terraza: parseBool(raw.terraza),
    garaje: parseBool(raw.garaje) || parseBool(raw.parking),
    ascensor: parseBool(raw.ascensor),
    trastero: parseBool(raw.trastero),
    piscina: parseBool(raw.piscina),
    aireAcondicionado: parseBool(raw.aireacondicionado) || parseBool(raw.aire_acondicionado),
    calefaccion: parseStr(raw.calefaccion),
    anoConstruccion: parseStr(raw.ano_construccion) ?? parseStr(raw.anoconstruccion),
    certificadoEnergetico: parseStr(raw.cert_energ) ?? parseStr(raw.certenerat),
  };
}

/**
 * Mapea tipoOfer de PropertyCurrent (que puede contener keyacci como string)
 * al tipo de operación de Statefox.
 *
 * Inmovilla keyacci: 1 = Venta, 2 = Alquiler, 3 = Traspaso, 4 = Alq. opción compra
 */
function resolveListingType(tipoOfer: string, raw: Record<string, unknown>): "sale" | "rent" {
  const keyacci = Number(raw.keyacci ?? 0);
  if (keyacci === 2 || keyacci === 4) return "rent";
  if (keyacci === 1 || keyacci === 3) return "sale";

  const lower = tipoOfer.toLowerCase();
  if (lower.includes("alquil") || lower.includes("rent")) return "rent";
  return "sale";
}

export async function extractPropertyForPricing(
  propertyCode: string,
): Promise<PricingPropertyInput> {
  const property = await prisma.propertyCurrent.findUnique({
    where: { codigo: propertyCode },
  });

  if (!property) {
    throw new PricingDataIncompleteError(propertyCode, ["propiedad no encontrada en PropertyCurrent"]);
  }

  const missing: string[] = [];
  if (!property.precio || property.precio <= 0) missing.push("precio");
  if (!property.metrosConstruidos || property.metrosConstruidos <= 0) missing.push("metrosConstruidos");
  if (!property.ciudad?.trim()) missing.push("ciudad");
  if (!property.zona?.trim()) missing.push("zona");

  if (missing.length > 0) {
    throw new PricingDataIncompleteError(propertyCode, missing);
  }

  const notEligibleReasons: string[] = [];
  if (!isCordobaCity(property.ciudad)) {
    notEligibleReasons.push("ciudad fuera de cobertura (solo Córdoba)");
  }

  if (notEligibleReasons.length > 0) {
    throw new PricingNotEligibleError(propertyCode, notEligibleReasons);
  }

  const snapshot = await prisma.propertySnapshot.findUnique({
    where: { codigo: propertyCode },
    select: { raw: true },
  });
  const raw = (snapshot?.raw as Record<string, unknown>) ?? {};

  const keyTipoNum = property.tipoOfer ? Number(property.tipoOfer) : NaN;
  let tipologiaNombre = "";
  let keyTipo: number | null = null;

  if (Number.isFinite(keyTipoNum) && keyTipoNum > 0) {
    keyTipo = keyTipoNum;
    const nombre = await getNombreTipoByKeyTipo(prisma, keyTipoNum);
    tipologiaNombre = nombre ?? "";
  }

  if (!tipologiaNombre && raw.tipo) {
    tipologiaNombre = String(raw.tipo);
  }

  const extras = extractExtras(raw);
  const tipoOperacion = resolveListingType(property.tipoOfer, raw);
  const precioM2 = property.metrosConstruidos > 0
    ? Math.round(property.precio / property.metrosConstruidos)
    : 0;

  return {
    propertyCode: property.codigo,
    precio: property.precio,
    precioM2,
    metrosConstruidos: property.metrosConstruidos,
    habitaciones: property.habitaciones,
    banyos: property.banyos,
    ciudad: property.ciudad,
    zona: property.zona,
    tipologiaNombre,
    keyTipo,
    tipoOperacion,
    estado: property.estado,
    fechaAlta: property.fechaAlta || null,
    fechaActualizacion: property.fechaActualizacion || null,
    extras,
  };
}
