/**
 * Lookup maps para resolver códigos numéricos de Inmovilla a nombres legibles.
 * Se precargan una vez al inicio del ciclo de ingesta desde las tablas
 * inmovilla_enum_ciudad, inmovilla_enum_zona e inmovilla_enum_tipo.
 */

import { prisma } from "@/lib/prisma";

export type EnumLookupMaps = {
  ciudadByKeyLoca: Map<number, string>;
  /** Clave compuesta `${key_loca}:${key_zona}` → nombre de zona */
  zonaByLocaZona: Map<string, string>;
  estadoByValue: Map<number, string>;
};

export async function loadEnumLookupMaps(): Promise<EnumLookupMaps> {
  const [ciudades, zonas, estadoRows] = await Promise.all([
    prisma.inmovillaEnumCiudad.findMany({
      select: { key_loca: true, ciudad: true },
    }),
    prisma.inmovillaEnumZona.findMany({
      select: { key_loca: true, key_zona: true, zona: true },
    }),
    prisma.inmovillaEnumTipo.findMany({
      where: { tipo: "estadoficha" },
      select: { valor: true, nombre: true },
    }),
  ]);

  const ciudadByKeyLoca = new Map<number, string>();
  for (const c of ciudades) {
    ciudadByKeyLoca.set(c.key_loca, c.ciudad);
  }

  const zonaByLocaZona = new Map<string, string>();
  for (const z of zonas) {
    zonaByLocaZona.set(`${z.key_loca}:${z.key_zona}`, z.zona);
  }

  const estadoByValue = new Map<number, string>();
  for (const e of estadoRows) {
    estadoByValue.set(e.valor, e.nombre);
  }

  return { ciudadByKeyLoca, zonaByLocaZona, estadoByValue };
}
