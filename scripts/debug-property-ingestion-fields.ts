/**
 * Depura cómo llegan ciudad, zona y “disponibilidad” desde Inmovilla antes del mapeo a
 * PropertySnapshot / PropertyCurrent.
 *
 * Uso (mismo token que el worker REST):
 *   npx tsx scripts/debug-property-ingestion-fields.ts
 *   npx tsx scripts/debug-property-ingestion-fields.ts --limit=5
 *   npx tsx scripts/debug-property-ingestion-fields.ts --cod_ofer=12345
 *
 * Requiere INMOVILLA_API_TOKEN (modo REST). Sin token, el worker usa legacy; para legacy
 * ver `npm run inmovilla:read-properties` (muestra ciudad/estado ya normalizados).
 */
import "dotenv/config";
import { createInmovillaRestClient } from "../lib/inmovilla/rest/client";
import {
  fetchPropertyList,
  getProperty,
  normalizePropertyFromRest,
} from "../lib/inmovilla/rest/properties";
import type { PropiedadCompleta } from "../lib/inmovilla/rest/types";
import { prisma } from "../lib/prisma";

const LOCATION_KEYS = [
  "key_loca",
  "key_zona",
  "localidad",
  "ciudad",
  "zona",
  "provincia",
  "cp",
  "calle",
  "numero",
] as const;

const AVAILABILITY_KEYS = [
  "nodisponible",
  "prospecto",
  "estadoficha",
  "lisestado",
  "keyacci",
] as const;

function pickRaw(
  raw: PropiedadCompleta,
  keys: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (raw[k] !== undefined) out[k] = raw[k];
  }
  return out;
}

function parseArgs(): { limit: number; codOfer: string | null } {
  let limit = 3;
  let codOfer: string | null = null;
  for (const a of process.argv.slice(2)) {
    if (a.startsWith("--limit=")) {
      limit = Math.max(1, parseInt(a.slice("--limit=".length), 10) || 3);
    } else if (a.startsWith("--cod_ofer=")) {
      codOfer = a.slice("--cod_ofer=".length).trim() || null;
    }
  }
  return { limit, codOfer };
}

async function resolveCiudadFromEnum(keyLoca: unknown): Promise<string | null> {
  const n = typeof keyLoca === "number" ? keyLoca : Number(keyLoca);
  if (!Number.isFinite(n)) return null;
  const row = await prisma.inmovillaEnumCiudad.findUnique({
    where: { key_loca: n },
    select: { ciudad: true, provincia: true },
  });
  if (!row) return null;
  return `${row.ciudad} (${row.provincia})`;
}

async function debugOne(raw: PropiedadCompleta, index: number, enumMaps?: import("../lib/inmovilla/rest/enum-lookup").EnumLookupMaps): Promise<void> {
  const norm = normalizePropertyFromRest(raw, enumMaps);
  const keyLoca = raw.key_loca;
  const enumCiudad =
    keyLoca != null && String(norm.ciudad).trim() === ""
      ? await resolveCiudadFromEnum(keyLoca)
      : null;

  console.log(`\n--- Ficha #${index + 1} cod_ofer=${raw.cod_ofer ?? "?"} ref=${raw.ref ?? ""} ---`);
  console.log("Claves de ubicación presentes en JSON crudo:", pickRaw(raw, LOCATION_KEYS));
  console.log("Claves de disponibilidad / estado en JSON crudo:", pickRaw(raw, AVAILABILITY_KEYS));
  console.log("Tras normalizePropertyFromRest:", {
    ciudad: norm.ciudad,
    zona: norm.zona,
    estado: norm.estado,
    nodisponible: norm.nodisponible,
    prospecto: norm.prospecto,
    tipoOfer: norm.tipoOfer,
  });
  if (enumCiudad) {
    console.log(
      "Ciudad resuelta vía inmovilla_enum_ciudad (key_loca):",
      enumCiudad,
      "→ el pipeline actual NO rellena `ciudad` desde aquí; habría que unir key_loca al enum.",
    );
  } else if (keyLoca != null && String(norm.ciudad).trim() === "") {
    console.log(
      "key_loca presente pero ciudad vacía y sin fila en inmovilla_enum_ciudad — ejecuta npm run inmovilla:sync-enums para poblar catálogos.",
    );
  }
}

async function main(): Promise<void> {
  const { limit, codOfer } = parseArgs();

  if (!process.env.INMOVILLA_API_TOKEN?.trim()) {
    console.error(
      "Falta INMOVILLA_API_TOKEN. El worker usa REST solo si está definido; sin él, la ingesta va por legacy (login + paginación).\n" +
        "Para depurar REST, configura el token. Para legacy, usa: npm run inmovilla:read-properties",
    );
    process.exit(1);
  }

  const { loadEnumLookupMaps } = await import("../lib/inmovilla/rest/enum-lookup");
  let enumMaps: Awaited<ReturnType<typeof loadEnumLookupMaps>> | undefined;
  try {
    enumMaps = await loadEnumLookupMaps();
    console.log(`Enum maps cargados: ${enumMaps.ciudadByKeyLoca.size} ciudades, ${enumMaps.zonaByKeyZona.size} zonas, ${enumMaps.estadoByValue.size} estados\n`);
  } catch {
    console.warn("No se pudieron cargar enum maps — resultados sin resolución de códigos\n");
  }

  const client = createInmovillaRestClient();

  if (codOfer) {
    const raw = await getProperty(client, codOfer);
    if (!raw) {
      console.error(`No se obtuvo ficha para cod_ofer=${codOfer}`);
      process.exit(1);
    }
    await debugOne(raw, 0, enumMaps);
    console.log("\nListado (1 ítem) para comparar flags del listado vs ficha:");
    const listado = await fetchPropertyList(client);
    const item = listado.find((x) => String(x.cod_ofer) === codOfer);
    console.log(item ?? "(no aparece en listado; puede estar fuera de orden o eliminada)");
    return;
  }

  console.log("[debug-property-ingestion] GET /propiedades/?listado …");
  const listado = await fetchPropertyList(client);
  console.log(`Listado: ${listado.length} ítems. Muestreo primeras ${limit} fichas completas.\n`);

  const sample = listado.slice(0, limit);
  let i = 0;
  for (const item of sample) {
    const raw = await getProperty(client, item.cod_ofer);
    if (!raw) {
      console.warn(`Omitido cod_ofer=${item.cod_ofer} (GET vacío)`);
      continue;
    }
    await debugOne(raw, i, enumMaps);
    console.log("Ítem listado (nodisponible / prospecto / fechaact):", {
      cod_ofer: item.cod_ofer,
      ref: item.ref,
      nodisponible: item.nodisponible,
      prospecto: item.prospecto,
      fechaact: item.fechaact,
    });
    i++;
  }

  console.log(
    "\n=== Resumen ===\n" +
      "- Si `localidad` y `ciudad` faltan en el JSON pero existe `key_loca`, el código actual deja ciudad=\"\".\n" +
      "- Solución típica: sincronizar enums (`npm run inmovilla:sync-enums`) y enriquecer normalizePropertyFromRest con lookup key_loca → ciudad.\n" +
      "- `prospecto` y matices de listado no se guardan en PropertyCurrent; solo nodisponible/estadoficha/lisestado vía `estado` en REST.",
  );
}

main()
  .catch((err) => {
    console.error("[debug-property-ingestion-fields]", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
