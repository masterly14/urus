/**
 * Sincronización de enums/catálogos Inmovilla desde API REST a Neon.
 * Respeta rate limit de 2 peticiones/minuto (espera 30s entre llamadas).
 * Uso: invocado por scripts/sync-inmovilla-enums.ts o por cron (QStash).
 */

import type { PrismaClient } from "@prisma/client";
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
const RATE_LIMIT_RECOVERY_MS = 120_000; // 2 min de espera ante 408

/**
 * Mapa CP prefix (2 dígitos) → nombre de provincia/capital.
 * Los 2 primeros dígitos del CP español identifican la provincia.
 */
const CP_PREFIX_TO_CITY: Record<string, string> = {
  "01": "Álava", "02": "Albacete", "03": "Alicante", "04": "Almería",
  "05": "Ávila", "06": "Badajoz", "07": "Baleares", "08": "Barcelona",
  "09": "Burgos", "10": "Cáceres", "11": "Cádiz", "12": "Castellón",
  "13": "Ciudad Real", "14": "Córdoba", "15": "A Coruña", "16": "Cuenca",
  "17": "Girona", "18": "Granada", "19": "Guadalajara", "20": "Gipuzkoa",
  "21": "Huelva", "22": "Huesca", "23": "Jaén", "24": "León",
  "25": "Lleida", "26": "La Rioja", "27": "Lugo", "28": "Madrid",
  "29": "Málaga", "30": "Murcia", "31": "Navarra", "32": "Ourense",
  "33": "Asturias", "34": "Palencia", "35": "Las Palmas", "36": "Pontevedra",
  "37": "Salamanca", "38": "S.C. Tenerife", "39": "Cantabria", "40": "Segovia",
  "41": "Sevilla", "42": "Soria", "43": "Tarragona", "44": "Teruel",
  "45": "Toledo", "46": "Valencia", "47": "Valladolid", "48": "Bizkaia",
  "49": "Zamora", "50": "Zaragoza", "51": "Ceuta", "52": "Melilla",
};

function cityFromCp(cp: string | undefined): string {
  if (!cp || cp.length < 2) return "";
  return CP_PREFIX_TO_CITY[cp.slice(0, 2)] ?? "";
}

function provinciaFromCp(cp: string | undefined): string {
  return cityFromCp(cp) || "Desconocida";
}

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

  // 4. Ciudades — probar primero sin país (España por defecto); si falla 404, reintentar con código 724
  let ciudadesByProvincia: Awaited<ReturnType<typeof getCiudades>> = [];
  try {
    ciudadesByProvincia = await getCiudades(client);
  } catch {
    console.log("[sync-enums] getCiudades() sin parámetro falló — reintentando con código 724");
    await throttle();
    const paisEspana =
      paises.find((p) => p.iso2 === "ES" || String(p.valor) === "724")?.valor ?? "724";
    ciudadesByProvincia = await getCiudades(client, String(paisEspana));
  }
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
    const paisValor = prov.pais != null ? String(prov.pais) : "724";
    const ciudadesArr = Array.isArray(prov.ciudades) ? prov.ciudades : [];
    for (const c of ciudadesArr) {
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
      try {
        const zonasData = await getZonas(client, batch);
        await throttle();
        await persistZonas(prisma, batch, zonasData);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("408") || msg.toLowerCase().includes("rate") || msg.toLowerCase().includes("límite")) {
          console.warn(`[sync-enums] Rate limit en zonas batch ${i}/${keyLocasToFetch.length}, esperando 2 min...`);
          await sleep(RATE_LIMIT_RECOVERY_MS);
          try {
            const zonasData = await getZonas(client, batch);
            await throttle();
            await persistZonas(prisma, batch, zonasData);
          } catch {
            console.warn(`[sync-enums] Reintento fallido, omitiendo batch zonas ${batch.slice(0, 3).join(",")}...`);
          }
        } else {
          console.warn(`[sync-enums] Error no retriable en zonas: ${msg}, omitiendo batch`);
        }
      }
    }
  }

  // 6. Enriquecimiento: key_loca usados por propiedades que no están en inmovilla_enum_ciudad
  //    La API /enums/?ciudades=724 solo devuelve ~100 ciudades (truncamiento del lado de Inmovilla).
  //    Para los key_loca que faltan: pedimos zonas (que sí funciona para cualquier key_loca),
  //    las guardamos, y registramos la ciudad con el nombre derivado del raw de la propiedad.
  await enrichMissingCities(client, prisma, skipZonas);
}

async function enrichMissingCities(
  client: InmovillaRestClient,
  prisma: PrismaClient,
  skipZonas: boolean,
): Promise<void> {
  const snapshots = await prisma.propertySnapshot.findMany({
    select: { raw: true },
  });

  const knownKeyLocas = new Set(
    (await prisma.inmovillaEnumCiudad.findMany({ select: { key_loca: true } })).map(
      (r) => r.key_loca,
    ),
  );

  const missingMap = new Map<number, { cp?: string; provincia?: string }>();
  for (const snap of snapshots) {
    const raw = snap.raw as Record<string, unknown> | null;
    if (!raw) continue;
    const kl = typeof raw.key_loca === "number" ? raw.key_loca : Number(raw.key_loca);
    if (!Number.isFinite(kl) || knownKeyLocas.has(kl) || missingMap.has(kl)) continue;
    missingMap.set(kl, {
      cp: typeof raw.cp === "string" ? raw.cp : undefined,
      provincia: typeof raw.provincia === "string" ? raw.provincia : undefined,
    });
  }

  if (missingMap.size === 0) return;
  console.log(
    `[sync-enums] ${missingMap.size} key_loca en propiedades no están en el catálogo de ciudades. Enriqueciendo...`,
  );

  const missingKeyLocas = [...missingMap.keys()];

  if (!skipZonas) {
    const BATCH_SIZE = 20;
    for (let i = 0; i < missingKeyLocas.length; i += BATCH_SIZE) {
      const batch = missingKeyLocas.slice(i, i + BATCH_SIZE);
      try {
        const zonasData = await getZonas(client, batch);
        await throttle();
        await persistZonas(prisma, batch, zonasData);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("408") || msg.toLowerCase().includes("límite")) {
          console.warn(`[sync-enums] Rate limit en zonas enriquecimiento, esperando 2 min...`);
          await sleep(RATE_LIMIT_RECOVERY_MS);
          try {
            const zonasData = await getZonas(client, batch);
            await throttle();
            await persistZonas(prisma, batch, zonasData);
          } catch {
            console.warn(`[sync-enums] Reintento fallido para zonas ${batch.slice(0, 3).join(",")}`);
          }
        } else {
          console.warn(`[sync-enums] Error zonas enriquecimiento: ${msg}`);
        }
      }
    }
  }

  for (const [keyLoca, info] of missingMap) {
    const cityName = cityFromCp(info.cp) || (info.cp ? `CP-${info.cp}` : `key_loca-${keyLoca}`);
    const provincia = cityFromCp(info.cp) ? provinciaFromCp(info.cp) : (info.provincia || "Desconocida");

    try {
      await prisma.inmovillaEnumCiudad.upsert({
        where: { key_loca: keyLoca },
        create: {
          key_loca: keyLoca,
          ciudad: cityName,
          provincia,
          cod_prov: 0,
          pais_valor: "724",
        },
        update: {
          ciudad: cityName,
          provincia,
        },
      });
      console.log(
        `[sync-enums] Ciudad registrada: key_loca=${keyLoca} → "${cityName}" (${provincia})`,
      );
    } catch (err) {
      console.warn(
        `[sync-enums] No se pudo registrar key_loca=${keyLoca}: ${err instanceof Error ? err.message : err}`,
      );
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
