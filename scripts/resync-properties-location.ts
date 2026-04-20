/**
 * Re-sincroniza ciudad/zona/estado para las propiedades en DB.
 *
 * Flujo:
 *   1. Carga enum maps (ciudades / zonas / estados / tipos).
 *   2. Lista propiedades REST (GET /propiedades/?listado) y filtra
 *      nodisponible/prospecto — las mismas que el ingestion worker.
 *   3. Por cada cod_ofer (con throttle 13 s, respeta 50/10min):
 *        - GET /propiedades/?cod_ofer=X
 *        - normalizePropertyFromRest(raw, enumMaps)
 *        - upsert en property_snapshots  **preservando el raw completo**
 *   4. Ejecuta enrichMissingCities() — registra los key_loca de las
 *      propiedades que no estaban en inmovilla_enum_ciudad (provincias
 *      distintas de A Coruña) y baja sus zonas.
 *   5. Recarga enum maps y hace una segunda pasada offline sobre los
 *      snapshots que quedaron sin ciudad / zona: resuelve desde `raw.key_loca`
 *      / `raw.key_zona` sin volver a pegarle a la API.
 *   6. Upsert directo en properties_current con los valores resueltos.
 *
 * Requiere INMOVILLA_API_TOKEN + DATABASE_URL en .env.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/resync-properties-location.ts
 *   npx tsx --env-file=.env scripts/resync-properties-location.ts --limit=5
 *   npx tsx --env-file=.env scripts/resync-properties-location.ts --only=28813690
 *   npx tsx --env-file=.env scripts/resync-properties-location.ts --skip-fetch       (solo re-resolver desde raw ya guardado)
 *   npx tsx --env-file=.env scripts/resync-properties-location.ts --no-enrich        (no tocar catálogo de ciudades)
 *   npx tsx --env-file=.env scripts/resync-properties-location.ts --only-existing    (solo cod_ofer ya en DB, no toda la lista de Inmovilla)
 */
import "dotenv/config";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { createInmovillaRestClient } from "../lib/inmovilla/rest/client";
import {
  fetchPropertyList,
  getProperty,
  normalizePropertyFromRest,
} from "../lib/inmovilla/rest/properties";
import type { PropiedadCompleta } from "../lib/inmovilla/rest/types";
import {
  loadEnumLookupMaps,
  type EnumLookupMaps,
} from "../lib/inmovilla/rest/enum-lookup";
import { enrichMissingCities } from "../lib/inmovilla/rest/sync-enums";
import {
  resolveComercialFromAgente,
  resolveComercialFromRef,
} from "../lib/routing/resolve-comercial";
import type { InmovillaProperty } from "../lib/inmovilla/api/types";

// ---------------------------------------------------------------------------
// Rate limit Inmovilla REST (propiedades):
//   - 10 req/min y 50 req/10min.
// Margen: 13 s/ficha = el mismo intervalo que el ingestion worker.
// ---------------------------------------------------------------------------
const REST_PROPERTY_FETCH_INTERVAL_MS = 13_000;
const MAX_NETWORK_RETRIES = 3;
const NETWORK_RETRY_DELAY_MS = 5_000;
const RATE_LIMIT_WAIT_MS = 120_000;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type Args = {
  limit: number | null;
  only: string | null;
  skipFetch: boolean;
  noEnrich: boolean;
  onlyExisting: boolean;
};

function parseArgs(): Args {
  const out: Args = {
    limit: null,
    only: null,
    skipFetch: false,
    noEnrich: false,
    onlyExisting: false,
  };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith("--limit=")) {
      out.limit = Math.max(1, parseInt(a.slice("--limit=".length), 10) || 0) || null;
    } else if (a.startsWith("--only=")) {
      out.only = a.slice("--only=".length).trim() || null;
    } else if (a === "--skip-fetch") {
      out.skipFetch = true;
    } else if (a === "--no-enrich") {
      out.noEnrich = true;
    } else if (a === "--only-existing") {
      out.onlyExisting = true;
    } else if (a === "--help" || a === "-h") {
      console.log(`
Uso: npx tsx --env-file=.env scripts/resync-properties-location.ts [opciones]

  --limit=N         Procesa solo las primeras N fichas (útil para pruebas).
  --only=COD        Solo la propiedad con cod_ofer=COD.
  --skip-fetch      No llama a la API; solo re-resuelve desde raw ya guardado.
  --no-enrich       No ejecuta enrichMissingCities.
  --only-existing   Usa como universo las cod_ofer de property_snapshots en DB.
                    Sin este flag, se usa el listado completo REST de Inmovilla.
`);
      process.exit(0);
    }
  }
  return out;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isRateLimitError(err: unknown): boolean {
  if (!err) return false;
  const msg = errMsg(err);
  return /\b408\b/.test(msg) || /rate|l[ií]mite/i.test(msg);
}

/**
 * Errores definitivos que NO deben reintentarse:
 *   - 404 Not Found (la propiedad ya no existe en Inmovilla)
 *   - 400 Bad Request
 *   - 401/403 auth
 */
function isDefinitiveError(err: unknown): { definitive: boolean; code?: string } {
  if (!err) return { definitive: false };
  const msg = errMsg(err);
  const m = msg.match(/\b(400|401|403|404|406)\b/);
  if (m) return { definitive: true, code: m[1] };
  return { definitive: false };
}

type FetchResult =
  | { kind: "ok"; raw: PropiedadCompleta }
  | { kind: "empty" } // la API devolvió algo no interpretable como ficha
  | { kind: "gone"; httpCode: string } // 404 u otro definitivo
  | { kind: "error"; message: string };

async function fetchWithRetry(
  client: ReturnType<typeof createInmovillaRestClient>,
  cod: string,
): Promise<FetchResult> {
  let networkRetries = 0;
  let rateRetries = 0;
  while (true) {
    try {
      const raw = await getProperty(client, cod);
      if (!raw) return { kind: "empty" };
      return { kind: "ok", raw };
    } catch (err) {
      const def = isDefinitiveError(err);
      if (def.definitive) {
        return { kind: "gone", httpCode: def.code ?? "?" };
      }
      if (isRateLimitError(err)) {
        rateRetries++;
        if (rateRetries > 3) return { kind: "error", message: errMsg(err) };
        console.warn(
          `  [${cod}] 408 rate limit → esperando ${Math.round(RATE_LIMIT_WAIT_MS / 1000)}s`,
        );
        await delay(RATE_LIMIT_WAIT_MS);
        continue;
      }
      networkRetries++;
      if (networkRetries > MAX_NETWORK_RETRIES) {
        return { kind: "error", message: errMsg(err) };
      }
      await delay(NETWORK_RETRY_DELAY_MS);
    }
  }
}

async function upsertSnapshot(
  p: InmovillaProperty,
  ts: Date,
): Promise<void> {
  const data = {
    codigo: p.codigo,
    ref: p.ref ?? "",
    titulo: p.titulo ?? "",
    tipoOfer: p.tipoOfer ?? "",
    precio: Number(p.precio) || 0,
    metrosConstruidos: Number(p.metrosConstruidos) || 0,
    habitaciones: Number(p.habitaciones) || 0,
    banyos: Number(p.banyos) || 0,
    ciudad: p.ciudad ?? "",
    zona: p.zona ?? "",
    estado: p.estado ?? "",
    nodisponible: Boolean(p.nodisponible),
    prospecto: Boolean(p.prospecto),
    fechaAlta: p.fechaAlta ?? "",
    fechaActualizacion: p.fechaActualizacion ?? "",
    numFotos: Number(p.numFotos) || 0,
    agente: p.agente ?? "",
  };
  const rawValue = (p.raw ?? {}) as Prisma.InputJsonValue;
  await prisma.propertySnapshot.upsert({
    where: { codigo: p.codigo },
    create: { ...data, raw: rawValue, firstSeenAt: ts, lastSeenAt: ts },
    update: { ...data, raw: rawValue, lastSeenAt: ts },
  });
}

async function upsertCurrent(p: InmovillaProperty): Promise<void> {
  let comercial = await resolveComercialFromAgente(p.agente ?? "");
  if (!comercial) comercial = await resolveComercialFromRef(p.ref ?? "");

  const now = new Date();
  const base = {
    ref: p.ref ?? "",
    titulo: p.titulo ?? "",
    tipoOfer: p.tipoOfer ?? "",
    precio: Number(p.precio) || 0,
    metrosConstruidos: Number(p.metrosConstruidos) || 0,
    habitaciones: Number(p.habitaciones) || 0,
    banyos: Number(p.banyos) || 0,
    ciudad: p.ciudad ?? "",
    zona: p.zona ?? "",
    estado: p.estado ?? "",
    nodisponible: Boolean(p.nodisponible),
    prospecto: Boolean(p.prospecto),
    fechaAlta: p.fechaAlta ?? "",
    fechaActualizacion: p.fechaActualizacion ?? "",
    numFotos: Number(p.numFotos) || 0,
    agente: comercial?.nombre ?? (p.agente ?? ""),
    comercialId: comercial?.id ?? null,
    lastEventId: "resync-properties-location",
    lastEventPosition: BigInt(0),
    lastEventAt: now,
  };

  await prisma.propertyCurrent.upsert({
    where: { codigo: p.codigo },
    create: { codigo: p.codigo, ...base },
    update: base,
  });
}

/**
 * Re-resuelve ciudad/zona/estado desde `raw` + enum maps actuales,
 * sin pegarle a la API. Útil como segunda pasada tras enrichMissingCities.
 */
function rebuildFromRaw(
  rawObj: Record<string, unknown>,
  enumMaps: EnumLookupMaps,
  fallback: Pick<InmovillaProperty, "ciudad" | "zona" | "estado">,
): { ciudad: string; zona: string; estado: string } {
  const keyLoca =
    typeof rawObj.key_loca === "number"
      ? rawObj.key_loca
      : Number(rawObj.key_loca);
  const keyZona =
    typeof rawObj.key_zona === "number"
      ? rawObj.key_zona
      : Number(rawObj.key_zona);

  const localidad = typeof rawObj.localidad === "string" ? rawObj.localidad.trim() : "";
  const ciudadRaw = typeof rawObj.ciudad === "string" ? rawObj.ciudad.trim() : "";

  const ciudad =
    localidad ||
    ciudadRaw ||
    (Number.isFinite(keyLoca) ? enumMaps.ciudadByKeyLoca.get(keyLoca) ?? "" : "") ||
    fallback.ciudad ||
    "";

  const zonaRaw = typeof rawObj.zona === "string" ? rawObj.zona.trim() : "";
  const zona =
    zonaRaw ||
    (Number.isFinite(keyLoca) && Number.isFinite(keyZona)
      ? enumMaps.zonaByLocaZona.get(`${keyLoca}:${keyZona}`) ?? ""
      : "") ||
    fallback.zona ||
    "";

  const estadoficha =
    typeof rawObj.estadoficha === "number" ? rawObj.estadoficha : undefined;
  const estado =
    (estadoficha != null ? enumMaps.estadoByValue.get(estadoficha) : undefined) ||
    (typeof rawObj.lisestado === "string" ? rawObj.lisestado : "") ||
    fallback.estado ||
    "";

  return { ciudad, zona, estado };
}

async function step1_loadEnumMaps(): Promise<EnumLookupMaps> {
  const m = await loadEnumLookupMaps();
  console.log(
    `[1] enum maps: ciudades=${m.ciudadByKeyLoca.size} zonas=${m.zonaByLocaZona.size} estados=${m.estadoByValue.size} tipos=${m.tipoByKeyTipo.size}`,
  );
  return m;
}

async function step2_selectCandidates(
  args: Args,
  client: ReturnType<typeof createInmovillaRestClient>,
): Promise<string[]> {
  if (args.only) {
    console.log(`[2] modo --only: 1 propiedad (${args.only})`);
    return [args.only];
  }

  if (args.onlyExisting) {
    const rows = await prisma.propertySnapshot.findMany({
      select: { codigo: true },
      orderBy: { codigo: "asc" },
    });
    const codes = rows.map((r) => r.codigo);
    console.log(`[2] modo --only-existing: ${codes.length} cod_ofer en DB`);
    return args.limit ? codes.slice(0, args.limit) : codes;
  }

  console.log("[2] pidiendo listado REST de Inmovilla...");
  const listado = await fetchPropertyList(client);
  console.log(`    listado: ${listado.length} propiedades`);
  const activos = listado.filter((x) => !x.nodisponible && !x.prospecto);
  console.log(`    activas (libre/disponibles): ${activos.length}`);
  const codes = activos.map((x) => String(x.cod_ofer));
  return args.limit ? codes.slice(0, args.limit) : codes;
}

async function step3_fetchAndPersist(
  codes: string[],
  client: ReturnType<typeof createInmovillaRestClient>,
  enumMaps: EnumLookupMaps,
): Promise<{
  fetched: number;
  failed: number;
  gone: string[]; // cod_ofer que Inmovilla reporta como 404
  processed: InmovillaProperty[];
}> {
  console.log(
    `[3] re-fetch + normalize + upsert snapshot (${codes.length} fichas, ~${Math.ceil((codes.length * REST_PROPERTY_FETCH_INTERVAL_MS) / 60_000)} min estimados)`,
  );
  const now = new Date();
  const processed: InmovillaProperty[] = [];
  const gone: string[] = [];
  let fetched = 0;
  let failed = 0;

  for (let i = 0; i < codes.length; i++) {
    const cod = codes[i];
    process.stdout.write(
      `  [${String(i + 1).padStart(3)}/${codes.length}] cod_ofer=${cod} ... `,
    );
    const res = await fetchWithRetry(client, cod);
    let sleepAfter = true;

    switch (res.kind) {
      case "ok": {
        const normalized = normalizePropertyFromRest(res.raw, enumMaps);
        await upsertSnapshot(normalized, now);
        processed.push(normalized);
        fetched++;
        console.log(
          `OK ciudad="${normalized.ciudad}" zona="${normalized.zona.substring(0, 25)}" estado="${normalized.estado}"`,
        );
        break;
      }
      case "gone": {
        gone.push(cod);
        failed++;
        sleepAfter = false; // 404 no consume cupo REST, podemos pasar al siguiente inmediatamente
        console.log(`GONE (HTTP ${res.httpCode}) — ya no existe en Inmovilla`);
        break;
      }
      case "empty": {
        failed++;
        console.log("EMPTY (ficha vacía)");
        break;
      }
      case "error": {
        failed++;
        console.log(`ERROR ${res.message}`);
        break;
      }
    }

    if (sleepAfter && i < codes.length - 1) {
      await delay(REST_PROPERTY_FETCH_INTERVAL_MS);
    }
  }
  return { fetched, failed, gone, processed };
}

async function step4_enrichCatalog(
  client: ReturnType<typeof createInmovillaRestClient>,
): Promise<void> {
  console.log(
    "[4] enriquecimiento del catálogo — registrando key_loca faltantes (derivados de raw.cp → provincia) y bajando sus zonas",
  );
  await enrichMissingCities(client, prisma, false);
}

async function step5_reresolveFromRaw(
  args: Args,
  enumMapsUpdated: EnumLookupMaps,
): Promise<{ updated: number; stillEmpty: number }> {
  console.log(
    "[5] segunda pasada: re-resolver ciudad/zona/estado desde raw con enum maps actualizados",
  );
  const where: Prisma.PropertySnapshotWhereInput = args.only
    ? { codigo: args.only }
    : { OR: [{ ciudad: "" }, { zona: "" }, { estado: "" }] };

  const snaps = await prisma.propertySnapshot.findMany({
    where,
    select: {
      codigo: true,
      ciudad: true,
      zona: true,
      estado: true,
      raw: true,
    },
  });
  console.log(`    snapshots candidatos: ${snaps.length}`);

  let updated = 0;
  let stillEmpty = 0;

  for (const s of snaps) {
    const rawObj =
      s.raw && typeof s.raw === "object" ? (s.raw as Record<string, unknown>) : null;
    if (!rawObj || Object.keys(rawObj).length === 0) {
      stillEmpty++;
      continue;
    }
    const resolved = rebuildFromRaw(rawObj, enumMapsUpdated, {
      ciudad: s.ciudad,
      zona: s.zona,
      estado: s.estado,
    });
    const changed =
      resolved.ciudad !== s.ciudad ||
      resolved.zona !== s.zona ||
      resolved.estado !== s.estado;
    if (!changed) continue;
    await prisma.propertySnapshot.update({
      where: { codigo: s.codigo },
      data: {
        ciudad: resolved.ciudad,
        zona: resolved.zona,
        estado: resolved.estado,
      },
    });
    updated++;
  }
  console.log(`    snapshots actualizados: ${updated}, aún vacíos (raw incompleto): ${stillEmpty}`);
  return { updated, stillEmpty };
}

async function step6_syncPropertyCurrent(args: Args): Promise<number> {
  console.log("[6] upsert de properties_current desde property_snapshots");
  const where: Prisma.PropertySnapshotWhereInput = args.only
    ? { codigo: args.only }
    : {};
  const snaps = await prisma.propertySnapshot.findMany({ where });

  let n = 0;
  for (const s of snaps) {
    const p: InmovillaProperty = {
      codigo: s.codigo,
      ref: s.ref,
      titulo: s.titulo,
      tipoOfer: s.tipoOfer,
      precio: s.precio,
      metrosConstruidos: s.metrosConstruidos,
      habitaciones: s.habitaciones,
      banyos: s.banyos,
      ciudad: s.ciudad,
      zona: s.zona,
      estado: s.estado,
      nodisponible: s.nodisponible,
      prospecto: s.prospecto,
      fechaAlta: s.fechaAlta,
      fechaActualizacion: s.fechaActualizacion,
      numFotos: s.numFotos,
      agente: s.agente,
      raw: (s.raw ?? {}) as Record<string, unknown>,
    };
    await upsertCurrent(p);
    n++;
  }
  console.log(`    properties_current upserted: ${n}`);
  return n;
}

async function step7_finalReport(): Promise<void> {
  const [totalSnap, snapEmptyCiudad, snapEmptyZona, totalCur, curEmptyCiudad, curEmptyZona] =
    await Promise.all([
      prisma.propertySnapshot.count(),
      prisma.propertySnapshot.count({ where: { ciudad: "" } }),
      prisma.propertySnapshot.count({ where: { zona: "" } }),
      prisma.propertyCurrent.count(),
      prisma.propertyCurrent.count({ where: { ciudad: "" } }),
      prisma.propertyCurrent.count({ where: { zona: "" } }),
    ]);
  console.log("\n=== Reporte final ===");
  console.log(
    `  property_snapshots  total=${totalSnap}  ciudad=""=${snapEmptyCiudad}  zona=""=${snapEmptyZona}`,
  );
  console.log(
    `  properties_current  total=${totalCur}   ciudad=""=${curEmptyCiudad}   zona=""=${curEmptyZona}`,
  );
}

async function main() {
  const args = parseArgs();
  console.log("resync-properties-location", args);

  if (!process.env.INMOVILLA_API_TOKEN?.trim() && !args.skipFetch) {
    console.error(
      "Falta INMOVILLA_API_TOKEN. Usa --skip-fetch si solo quieres re-resolver desde raw ya guardado.",
    );
    process.exit(1);
  }

  const client = createInmovillaRestClient();

  let enumMaps = await step1_loadEnumMaps();

  let processed: InmovillaProperty[] = [];
  if (!args.skipFetch) {
    const codes = await step2_selectCandidates(args, client);
    if (codes.length === 0) {
      console.log("No hay propiedades para procesar. Abortando.");
      await step7_finalReport();
      return;
    }
    const r = await step3_fetchAndPersist(codes, client, enumMaps);
    console.log(
      `[3] fetched=${r.fetched} failed=${r.failed} gone(404)=${r.gone.length}`,
    );
    if (r.gone.length > 0) {
      console.log(`    cod_ofer GONE: ${r.gone.slice(0, 10).join(", ")}${r.gone.length > 10 ? "..." : ""}`);
      console.log(
        `    → estos códigos ya no existen en Inmovilla; considera borrarlos de property_snapshots/properties_current.`,
      );
    }
    processed = r.processed;
  } else {
    console.log("[2-3] --skip-fetch activo: omitiendo REST, trabajando solo con raw existente");
  }

  if (!args.noEnrich) {
    await step4_enrichCatalog(client);
    enumMaps = await step1_loadEnumMaps();
  } else {
    console.log("[4] --no-enrich activo: omitiendo enriquecimiento de catálogo");
  }

  await step5_reresolveFromRaw(args, enumMaps);
  await step6_syncPropertyCurrent(args);
  await step7_finalReport();

  // processed puede no cubrir todos los cod_ofer; el paso 6 ya sincronizó la DB entera.
  void processed;
}

main()
  .catch((err) => {
    console.error("[resync-properties-location] ERROR:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
