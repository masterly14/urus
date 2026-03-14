/**
 * API interna de lectura de catálogos Inmovilla desde Neon.
 * Los datos se rellenan con scripts/sync-inmovilla-enums.ts (API REST, rate limit 2/min).
 * Uso: Egestion Worker (key_loca, key_tipo, key_zona al crear propiedades/demandas), lib/geo (key_zona -> polígonos).
 */

import type { PrismaClient } from "@/app/generated/prisma/client";

export type CatalogSearchParams = {
  ciudadNombre?: string;
  provincia?: string;
  paisValor?: string;
};

/**
 * Devuelve key_loca por nombre de ciudad y opcionalmente provincia.
 * Búsqueda case-insensitive por ciudad; si hay varias coincidencias y se pasa provincia, filtra por ella.
 */
export async function getKeyLocaByCiudad(
  prisma: PrismaClient,
  params: CatalogSearchParams,
): Promise<number | null> {
  const { ciudadNombre, provincia } = params;
  if (!ciudadNombre?.trim()) return null;

  const normalized = ciudadNombre.trim();
  const where: { ciudad: { equals: string; mode: "insensitive" }; provincia?: { equals: string; mode: "insensitive" } } = {
    ciudad: { equals: normalized, mode: "insensitive" },
  };
  if (provincia?.trim()) {
    where.provincia = { equals: provincia.trim(), mode: "insensitive" };
  }

  const row = await prisma.inmovillaEnumCiudad.findFirst({
    where,
    select: { key_loca: true },
  });
  return row?.key_loca ?? null;
}

/**
 * Devuelve el valor numérico de key_tipo para un nombre de tipo de propiedad (ej. "Piso", "Chalet").
 * Búsqueda en InmovillaEnumTipo donde tipo = "key_tipo".
 */
export async function getKeyTipoByNombre(
  prisma: PrismaClient,
  tipoPropiedad: string,
): Promise<number | null> {
  if (!tipoPropiedad?.trim()) return null;

  const row = await prisma.inmovillaEnumTipo.findFirst({
    where: {
      tipo: "key_tipo",
      nombre: { equals: tipoPropiedad.trim(), mode: "insensitive" },
    },
    select: { valor: true },
  });
  return row?.valor ?? null;
}

/**
 * Devuelve key_zona por nombre de zona y key_loca (ciudad).
 */
export async function getKeyZonaByZonaAndKeyLoca(
  prisma: PrismaClient,
  nombreZona: string,
  keyLoca: number,
): Promise<number | null> {
  if (!nombreZona?.trim()) return null;

  const row = await prisma.inmovillaEnumZona.findFirst({
    where: {
      key_loca: keyLoca,
      zona: { equals: nombreZona.trim(), mode: "insensitive" },
    },
    select: { key_zona: true },
  });
  return row?.key_zona ?? null;
}

/**
 * Lista ciudades por país (valor de InmovillaEnumPais.valor).
 */
export async function getCiudadesByPais(
  prisma: PrismaClient,
  paisValor: string,
): Promise<{ key_loca: number; ciudad: string; provincia: string }[]> {
  const rows = await prisma.inmovillaEnumCiudad.findMany({
    where: { pais_valor: paisValor?.trim() ?? null },
    select: { key_loca: true, ciudad: true, provincia: true },
    orderBy: [{ provincia: "asc" }, { ciudad: "asc" }],
  });
  return rows;
}

/**
 * Lista zonas por key_loca (ciudad). Útil para lib/geo (mapear key_zona a polígonos).
 */
export async function getZonasByKeyLoca(
  prisma: PrismaClient,
  keyLoca: number,
): Promise<{ key_zona: number; zona: string }[]> {
  const rows = await prisma.inmovillaEnumZona.findMany({
    where: { key_loca: keyLoca },
    select: { key_zona: true, zona: true },
    orderBy: { zona: "asc" },
  });
  return rows;
}
