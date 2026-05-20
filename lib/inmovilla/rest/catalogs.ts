/**
 * API interna de lectura de catálogos Inmovilla desde Neon.
 * Los datos se rellenan con scripts/sync-inmovilla-enums.ts (API REST, rate limit 2/min).
 * Uso: Egestion Worker (key_loca, key_tipo, key_zona al crear propiedades/demandas), lib/geo (key_zona -> polígonos).
 */

import type { PrismaClient } from "@prisma/client";

export type CatalogSearchParams = {
  ciudadNombre?: string;
  provincia?: string;
  paisValor?: string;
};

/**
 * Sufijos de slug que añaden los portales españoles a sus ciudades (Pisos.com:
 * `cordoba_capital`, `madrid_provincia`; Idealista: `palma-de-mallorca`;
 * Fotocasa: `sevilla-capital`). Se eliminan antes de comparar contra el
 * catálogo Inmovilla (que guarda nombres limpios tipo "Córdoba", "Madrid").
 */
const CITY_SLUG_SUFFIXES = [
  "capital",
  "provincia",
  "municipio",
  "ciudad",
  "pueblo",
];

/**
 * Normaliza un nombre de ciudad en la forma "slug ASCII sin acentos, sin
 * separadores ni sufijos de portal" para comparar de manera tolerante con el
 * catálogo Inmovilla.
 *
 * Ejemplos:
 *   "cordoba_capital"      → "cordoba"
 *   "Córdoba"              → "cordoba"
 *   "palma-de-mallorca"    → "palma de mallorca"
 *   "Sant Cugat del Vallès"→ "sant cugat del valles"
 *
 * Exportado para tests y para reusar en otros catálogos (zonas).
 */
export function normalizeCityForCatalog(value: string): string {
  if (!value) return "";
  const ascii = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!ascii) return "";

  const parts = ascii.split(" ").filter((p) => p && !CITY_SLUG_SUFFIXES.includes(p));
  return parts.join(" ").trim();
}

/**
 * Devuelve key_loca por nombre de ciudad y opcionalmente provincia.
 *
 * Estrategia (tolerante a slugs de portales como `cordoba_capital`):
 *   1. Match exacto case-insensitive (rápido, cubre nombres ya limpios).
 *   2. Match contra variantes derivadas del input (sin sufijos `_capital`,
 *      `_provincia`; separadores `_`/`-` → espacios).
 *   3. Fallback acento-insensible en JS contra todo el catálogo (~8000 filas).
 *      Sólo se ejecuta si los pasos anteriores fallan; la consulta sigue
 *      siendo barata en Neon.
 */
export async function getKeyLocaByCiudad(
  prisma: PrismaClient,
  params: CatalogSearchParams,
): Promise<number | null> {
  const { ciudadNombre, provincia } = params;
  if (!ciudadNombre?.trim()) return null;

  const trimmed = ciudadNombre.trim();
  const provinciaTrimmed = provincia?.trim() || null;

  const candidates = buildCityCandidates(trimmed);

  for (const candidate of candidates) {
    const where: {
      ciudad: { equals: string; mode: "insensitive" };
      provincia?: { equals: string; mode: "insensitive" };
    } = {
      ciudad: { equals: candidate, mode: "insensitive" },
    };
    if (provinciaTrimmed) {
      where.provincia = { equals: provinciaTrimmed, mode: "insensitive" };
    }
    const row = await prisma.inmovillaEnumCiudad.findFirst({
      where,
      select: { key_loca: true },
    });
    if (row?.key_loca != null) return row.key_loca;
  }

  // Fallback acento-insensible: en `mode: "insensitive"` de Prisma sólo se
  // ignora la caja, no los acentos. Buscamos en JS contra el catálogo
  // completo (o filtrado por provincia si se ha pasado).
  const slug = normalizeCityForCatalog(trimmed);
  if (!slug) return null;

  const rows = await prisma.inmovillaEnumCiudad.findMany({
    where: provinciaTrimmed
      ? { provincia: { equals: provinciaTrimmed, mode: "insensitive" } }
      : undefined,
    select: { key_loca: true, ciudad: true },
  });
  const match = rows.find((row) => normalizeCityForCatalog(row.ciudad) === slug);
  return match?.key_loca ?? null;
}

function buildCityCandidates(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(trimmed);
  };

  push(input);
  push(input.replace(/[_-]+/g, " "));

  const lower = input.toLowerCase();
  for (const suffix of CITY_SLUG_SUFFIXES) {
    for (const sep of ["_", "-", " "]) {
      const needle = `${sep}${suffix}`;
      if (lower.endsWith(needle)) {
        const stripped = input.slice(0, -needle.length);
        push(stripped);
        push(stripped.replace(/[_-]+/g, " "));
      }
    }
  }

  return out;
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
 * Devuelve key_zona por nombre de zona y key_loca (ciudad). Tolerante a
 * acentos y separadores: portales como Pisos.com devuelven "Centro" pero
 * Inmovilla guarda variantes como "Centro Histórico" o "Córdoba Capital".
 * Se aplica la misma normalización slug-style que en `getKeyLocaByCiudad`
 * para evitar falsos negativos.
 */
export async function getKeyZonaByZonaAndKeyLoca(
  prisma: PrismaClient,
  nombreZona: string,
  keyLoca: number,
): Promise<number | null> {
  if (!nombreZona?.trim()) return null;

  const trimmed = nombreZona.trim();

  const exact = await prisma.inmovillaEnumZona.findFirst({
    where: {
      key_loca: keyLoca,
      zona: { equals: trimmed, mode: "insensitive" },
    },
    select: { key_zona: true },
  });
  if (exact?.key_zona != null) return exact.key_zona;

  const slug = normalizeCityForCatalog(trimmed);
  if (!slug) return null;

  const rows = await prisma.inmovillaEnumZona.findMany({
    where: { key_loca: keyLoca },
    select: { key_zona: true, zona: true },
  });

  const exactMatch = rows.find(
    (row) => normalizeCityForCatalog(row.zona) === slug,
  );
  if (exactMatch) return exactMatch.key_zona;

  // Como último recurso, "contiene": útil cuando el portal entrega "Centro"
  // y el catálogo tiene "Centro Histórico" o "Casco Histórico - Centro".
  const partialMatch = rows.find((row) => {
    const candidate = normalizeCityForCatalog(row.zona);
    return candidate.includes(slug) || slug.includes(candidate);
  });
  return partialMatch?.key_zona ?? null;
}

/**
 * Devuelve el nombre textual de un tipo de propiedad por su valor numérico (key_tipo).
 * Inversa de getKeyTipoByNombre. Ej: 3 → "Piso".
 */
export async function getNombreTipoByKeyTipo(
  prisma: PrismaClient,
  keyTipoValor: number,
): Promise<string | null> {
  const row = await prisma.inmovillaEnumTipo.findFirst({
    where: {
      tipo: "key_tipo",
      valor: keyTipoValor,
    },
    select: { nombre: true },
  });
  return row?.nombre ?? null;
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
