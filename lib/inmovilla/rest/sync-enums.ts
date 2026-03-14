/**
 * Sincronización de enums/catálogos Inmovilla desde API REST a Neon.
 * Respeta rate limit de 2 peticiones/minuto (espera 30s entre llamadas).
 * Uso: invocado por scripts/sync-inmovilla-enums.ts o por cron (QStash).
 */

import type { PrismaClient } from "@/app/generated/prisma/client";
import type { InmovillaRestClient } from "./client";
import {
  getCalidades,
  getTipos,
  getPaises,
  getCiudades,
  getZonas,
} from "./enums";
import type { EnumZonasResponse } from "./types";

const THROTTLE_MS = 30_000; // 2 req/min => 1 cada 30s

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function throttle(): Promise<void> {
  await sleep(THROTTLE_MS);
}

export type SyncEnumsOptions = {
  /** Si true, no descarga zonas (requiere key_loca; se puede hacer en una segunda pasada). */
  skipZonas?: boolean;
  /** key_loca a usar para zonas (solo si skipZonas=false). Si vacío, se usan los key_loca de ciudades ya guardadas. */
  keyLocasForZonas?: number[];
};

/**
 * Sincroniza todos los enums de la API al Prisma.
 * Entre cada petición espera THROTTLE_MS para no superar 2/min.
 */
export async function syncEnums(
  client: InmovillaRestClient,
  prisma: PrismaClient,
  options: SyncEnumsOptions = {},
): Promise<void> {
  const { skipZonas = false, keyLocasForZonas = [] } = options;

  // 1. Calidades
  const calidades = await getCalidades(client);
  await throttle();
  await prisma.inmovillaEnumCalidad.deleteMany({});
  if (calidades.length > 0) {
    await prisma.inmovillaEnumCalidad.createMany({
      data: calidades.map((c) => ({ campo: c.campo, valores: c.valores })),
      skipDuplicates: true,
    });
  }

  // 2. Tipos (objeto con muchas claves; aplanar a filas tipo + nombre + valor)
  const tipos = await getTipos(client);
  await throttle();
  await prisma.inmovillaEnumTipo.deleteMany({});
  const tipoRows: { tipo: string; nombre: string; valor: number }[] = [];
  for (const [tipo, items] of Object.entries(tipos)) {
    if (Array.isArray(items)) {
      for (const item of items) {
        tipoRows.push({ tipo, nombre: item.nombre, valor: item.valor });
      }
    }
  }
  if (tipoRows.length > 0) {
    await prisma.inmovillaEnumTipo.createMany({
      data: tipoRows,
      skipDuplicates: true,
    });
  }

  // 3. Países
  const paises = await getPaises(client);
  await throttle();
  await prisma.inmovillaEnumPais.deleteMany({});
  if (paises.length > 0) {
    await prisma.inmovillaEnumPais.createMany({
      data: paises.map((p) => ({
        pais: p.pais,
        valor: p.valor,
        iso2: p.iso2,
        iso3: p.iso3,
      })),
      skipDuplicates: true,
    });
  }

  // 4. Ciudades (España por defecto)
  const ciudadesByProvincia = await getCiudades(client);
  await throttle();
  await prisma.inmovillaEnumCiudad.deleteMany({});
  const ciudadRows: {
    key_loca: number;
    ciudad: string;
    provincia: string;
    cod_prov: number;
    pais_valor: string | null;
  }[] = [];
  for (const prov of ciudadesByProvincia) {
    const paisValor = prov.pais != null ? String(prov.pais) : "724"; // 724 = España por defecto
    for (const c of prov.ciudades ?? []) {
      ciudadRows.push({
        key_loca: c.key_loca,
        ciudad: c.ciudad,
        provincia: prov.provincia,
        cod_prov: prov.cod_prov,
        pais_valor: paisValor,
      });
    }
  }
  if (ciudadRows.length > 0) {
    await prisma.inmovillaEnumCiudad.createMany({
      data: ciudadRows,
      skipDuplicates: true,
    });
  }

  // 5. Zonas (opcional): por key_loca (batch de hasta N ciudades por petición para no hacer demasiadas llamadas)
  if (!skipZonas) {
    await prisma.inmovillaEnumZona.deleteMany({});
    const keyLocasToFetch =
      keyLocasForZonas.length > 0
        ? keyLocasForZonas
        : (await prisma.inmovillaEnumCiudad.findMany({ select: { key_loca: true } })).map(
            (r) => r.key_loca,
          );
    const BATCH_SIZE = 20;
    for (let i = 0; i < keyLocasToFetch.length; i += BATCH_SIZE) {
      const batch = keyLocasToFetch.slice(i, i + BATCH_SIZE);
      const zonasData = await getZonas(client, batch);
      await throttle();
      await persistZonas(prisma, batch, zonasData);
    }
  }
}

function persistZonas(
  prisma: PrismaClient,
  keyLocas: number[],
  data: EnumZonasResponse,
): Promise<unknown> {
  const rows: { key_zona: number; key_loca: number; zona: string }[] = [];
  for (const keyLoca of keyLocas) {
    const arr = data[String(keyLoca)];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      const key_zona: number = item.key_zona ?? item.key_loca ?? 0;
      const zona = (item.zona ?? item.ciudad ?? "").trim() || String(key_zona);
      rows.push({ key_zona, key_loca: keyLoca, zona });
    }
  }
  if (rows.length === 0) return Promise.resolve();
  return prisma.inmovillaEnumZona.createMany({
    data: rows,
    skipDuplicates: true,
  });
}
