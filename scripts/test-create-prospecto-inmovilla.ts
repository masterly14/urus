import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { loadSessionFromDb, saveSessionToDb } from "@/lib/inmovilla/auth/session-store";
import { loginToInmovilla } from "@/lib/inmovilla/auth/login";
import { createProspecto, changeProspectoStatus } from "@/lib/inmovilla/crm/create-prospecto";
import {
  getKeyLocaByCiudad,
  getKeyTipoByNombre,
  getKeyZonaByZonaAndKeyLoca,
  getZonasByKeyLoca,
} from "@/lib/inmovilla/rest/catalogs";
import type { InmovillaSession } from "@/lib/inmovilla/auth/types";

type CliOptions = {
  city: string;
  zone: string;
  countryCode: string;
  street: string;
  number: number;
  cp: string;
  floor?: string;
  cadastralRef: string;
  tipo: string;
  operation: "VENTA" | "ALQUILER";
  price: number;
  rooms: number;
  baths: number;
  meters: number;
  agenteId?: string;
  keycli: number;
  keymedio: number;
  tituloes?: string;
  descripciones?: string;
  noStatusChange: boolean;
};

async function loadSeedRawForCity(city: string): Promise<{ codigo: string; raw: Record<string, unknown> } | null> {
  const current = await prisma.propertyCurrent.findFirst({
    where: { ciudad: { equals: city, mode: "insensitive" } },
    select: { codigo: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!current) return null;

  const snapshot = await prisma.propertySnapshot.findUnique({
    where: { codigo: current.codigo },
    select: { raw: true },
  });
  if (!snapshot || typeof snapshot.raw !== "object" || snapshot.raw === null) {
    return null;
  }

  return {
    codigo: current.codigo,
    raw: snapshot.raw as Record<string, unknown>,
  };
}

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length).trim() : undefined;
}

function parseIntArg(name: string, fallback: number): number {
  const value = readArg(name);
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Argumento inválido --${name}=${value}`);
  }
  return parsed;
}

function parseCli(): CliOptions {
  const operationRaw = (readArg("operation") ?? "VENTA").toUpperCase();
  const operation = operationRaw === "ALQUILER" ? "ALQUILER" : "VENTA";

  return {
    city: readArg("city") ?? "Córdoba",
    zone: readArg("zone") ?? "Centro",
    countryCode: readArg("countryCode") ?? "724",
    street: readArg("street") ?? "Calle de Prueba Urus",
    number: parseIntArg("number", 12),
    cp: readArg("cp") ?? "14001",
    floor: readArg("floor") ?? "2",
    // Referencia catastral española de ejemplo (20 chars).
    cadastralRef: readArg("cadastralRef") ?? "9872023VH5797S0006XS",
    tipo: readArg("tipo") ?? "Piso",
    operation,
    price: parseIntArg("price", operation === "VENTA" ? 275000 : 1200),
    rooms: parseIntArg("rooms", 3),
    baths: parseIntArg("baths", 2),
    meters: parseIntArg("meters", 95),
    agenteId: readArg("agenteId") ?? process.env.INMOVILLA_AGENT_ID,
    keycli: parseIntArg("keycli", 0),
    keymedio: parseIntArg("keymedio", 12),
    tituloes: readArg("tituloes"),
    descripciones: readArg("descripciones"),
    noStatusChange: process.argv.includes("--no-status-change"),
  };
}

async function getSession() {
  const dbSession = await loadSessionFromDb();
  if (dbSession) {
    console.log("[test-prospecto] Usando sesión de Inmovilla desde DB.");
    return dbSession;
  }

  console.log("[test-prospecto] No hay sesión en DB. Haciendo login...");
  const fresh = await loginToInmovilla({
    headless: true,
    persistSession: true,
  });
  await saveSessionToDb(fresh, "test-create-prospecto");
  return fresh;
}

async function resolveCatalogKeys(opts: CliOptions) {
  // Priorizar país explícito (por defecto ES=724) para evitar colisiones
  // de ciudades homónimas (p.ej. "Córdoba" fuera de España).
  let keyLoca = (
    await prisma.inmovillaEnumCiudad.findFirst({
      where: {
        ciudad: { equals: opts.city, mode: "insensitive" },
        pais_valor: opts.countryCode,
      },
      select: { key_loca: true },
      orderBy: [{ provincia: "asc" }, { key_loca: "asc" }],
    })
  )?.key_loca;

  if (!keyLoca) {
    keyLoca = await getKeyLocaByCiudad(prisma, { ciudadNombre: opts.city }) ?? undefined;
  }
  if (!keyLoca) {
    throw new Error(
      `No se encontró key_loca para ciudad "${opts.city}". Ejecuta antes: npm run inmovilla:sync-enums`,
    );
  }

  let keyZona = await getKeyZonaByZonaAndKeyLoca(prisma, opts.zone, keyLoca);
  if (!keyZona) {
    const zonas = await getZonasByKeyLoca(prisma, keyLoca);
    if (zonas.length > 0) {
      keyZona = zonas[0].key_zona;
      console.warn(
        `[test-prospecto] Zona "${opts.zone}" no encontrada en ${opts.city}. Usando zona fallback "${zonas[0].zona}" (key_zona=${keyZona}).`,
      );
    } else {
      keyZona = 0;
      console.warn(
        `[test-prospecto] No hay zonas para key_loca=${keyLoca}. Se enviará key_zona=0.`,
      );
    }
  }

  const keyTipo = (await getKeyTipoByNombre(prisma, opts.tipo)) ?? 2799;
  if (keyTipo === 2799 && opts.tipo.toLowerCase() !== "piso") {
    console.warn(
      `[test-prospecto] Tipo "${opts.tipo}" no encontrado. Usando fallback key_tipo=2799 (Piso).`,
    );
  }

  return { keyLoca, keyZona, keyTipo };
}

async function createProspectoWithRetryOn401(
  session: InmovillaSession,
  payload: Parameters<typeof createProspecto>[1],
): Promise<Awaited<ReturnType<typeof createProspecto>>> {
  try {
    return await createProspecto(session, payload);
  } catch (err) {
    const is401 = err instanceof Error && err.message.includes(" 401 ");
    if (!is401) throw err;

    console.warn(
      "[test-prospecto] 401 Unauthorized con sesión actual. Renovando sesión y reintentando...",
    );
    const refreshed = await loginToInmovilla({
      headless: true,
      persistSession: true,
      forceFreshLogin: true,
    });
    await saveSessionToDb(refreshed, "test-create-prospecto-retry");

    return createProspecto(refreshed, {
      ...payload,
      numagencia: refreshed.numAgencia,
      keyagente: payload.keyagente || refreshed.idUsuario,
    });
  }
}

function applyMissingFieldDefaultsFrom400(
  err: unknown,
  seedRaw: Record<string, unknown>,
): { updated: boolean; missingIds: string[] } {
  if (!(err instanceof Error) || !err.message.includes(" 400 ")) {
    return { updated: false, missingIds: [] };
  }

  const ids = Array.from(err.message.matchAll(/"id":"([^"]+)"/g)).map((m) => m[1]);
  if (ids.length === 0) return { updated: false, missingIds: [] };

  let updated = false;
  for (const id of ids) {
    if (seedRaw[id] != null) continue;
    if (id === "alqindex" || id === "alqinferior" || id === "alqsuperior") {
      seedRaw[id] = "0.00";
    } else {
      seedRaw[id] = 0;
    }
    updated = true;
  }

  return { updated, missingIds: ids };
}

async function main() {
  const opts = parseCli();
  const session = await getSession();
  const { keyLoca, keyZona, keyTipo } = await resolveCatalogKeys(opts);
  const seed = await loadSeedRawForCity(opts.city);

  const keyagente = opts.agenteId ?? session.idUsuario;
  const keyacci = opts.operation === "ALQUILER" ? 2 : 1;
  const precioinmo = keyacci === 1 ? opts.price : 0;
  const precioalq = keyacci === 2 ? opts.price : 0;

  const tituloes =
    opts.tituloes?.trim() ||
    `${opts.tipo} ${opts.operation === "ALQUILER" ? "en alquiler" : "en venta"} — ${opts.street} ${opts.number}, ${opts.city}`;
  const descripciones =
    opts.descripciones?.trim() ||
    `Prospecto de prueba. ${opts.tipo} de ${opts.meters} m² construidos, ${opts.rooms} habitaciones, ${opts.baths} baños. Referencia catastral: ${opts.cadastralRef}. Dirección: ${opts.street} ${opts.number}, ${opts.cp} ${opts.city}.`;

  console.log("[test-prospecto] Creando prospecto en Inmovilla...");
  console.log(
    `[test-prospecto] city=${opts.city} key_loca=${keyLoca} key_zona=${keyZona} tipo=${opts.tipo} key_tipo=${keyTipo}`,
  );
  console.log(
    `[test-prospecto] operation=${opts.operation} price=${opts.price} cadastral=${opts.cadastralRef}`,
  );
  console.log(
    `[test-prospecto] keyagente=${keyagente} keycli=${opts.keycli} keymedio=${opts.keymedio}`,
  );
  console.log(`[test-prospecto] tituloes="${tituloes}"`);
  console.log(`[test-prospecto] descripciones="${descripciones.slice(0, 100)}${descripciones.length > 100 ? "..." : ""}"`);
  if (seed) {
    console.log(`[test-prospecto] seedRaw tomado de propertySnapshot codigo=${seed.codigo}`);
  } else {
    console.log("[test-prospecto] seedRaw no disponible para la ciudad; se usará payload base.");
  }

  const adaptiveSeedRaw: Record<string, unknown> = { ...(seed?.raw ?? {}) };
  let created: Awaited<ReturnType<typeof createProspecto>> | null = null;
  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      created = await createProspectoWithRetryOn401(session, {
        key_loca: keyLoca,
        key_zona: keyZona,
        key_tipo: keyTipo,
        calle: opts.street,
        numero: opts.number,
        cp: opts.cp,
        planta: opts.floor,
        referenciaCatastral: opts.cadastralRef,
        keyacci,
        precioinmo,
        precioalq,
        habitaciones: opts.rooms,
        banyos: opts.baths,
        m_cons: opts.meters,
        keyagente,
        keycli: opts.keycli,
        numagencia: session.numAgencia,
        keymedio: opts.keymedio,
        tituloes,
        descripciones,
        seedRaw: adaptiveSeedRaw,
      });
      break;
    } catch (err) {
      const { updated, missingIds } = applyMissingFieldDefaultsFrom400(err, adaptiveSeedRaw);
      if (updated && attempt < maxAttempts) {
        console.warn(
          `[test-prospecto] Intento ${attempt}/${maxAttempts} rechazado por campos obligatorios. Añadiendo defaults para: ${missingIds.join(", ")}`,
        );
        continue;
      }
      throw err;
    }
  }

  if (!created) {
    throw new Error("No se pudo crear el prospecto tras varios reintentos.");
  }

  console.log(
    `[test-prospecto] Prospecto creado OK: cod_ofer=${created.cod_ofer} ref=${created.mainData?.ref ?? "N/A"}`,
  );

  if (!opts.noStatusChange) {
    await changeProspectoStatus(session, created.cod_ofer, {
      estado: 1,
      subEstado: 1,
      comentario: "Script de prueba: validación creación prospecto",
    });
    console.log("[test-prospecto] Estado cambiado a Activo (1/1).");
  } else {
    console.log("[test-prospecto] --no-status-change: no se cambió estado.");
  }

  console.log("\n✅ Test completado.");
  console.log(`   cod_ofer: ${created.cod_ofer}`);
  console.log(`   ref: ${created.mainData?.ref ?? "N/A"}`);
}

main()
  .catch((err) => {
    console.error(
      "\n❌ Falló test de creación de prospecto:",
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
