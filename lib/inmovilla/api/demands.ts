import type { InmovillaSession } from "../auth/types";
import { createInmovillaClient } from "./client";
import type {
  InmovillaDemand,
  InmovillaDemandRaw,
} from "./types-demands";
import {
  validatePaginationResponse,
  validateDemandRecord,
} from "./demand-schemas";
import { extractRefConsultadaFromDemandMap } from "./ref-consultada";
import { fetchDemandasFichaFull } from "./ficha-demanda";

const PAGINATION_PATH = "/new/app/api/v1/paginacion/";
const ACTIVE_DEMAND_STATES = "20,23,26,31";

export type DemandFichaEnrichConfig = {
  enabled: boolean;
  /** ref: solo si falta refConsultada; identifiers: también si faltan siglas o inmovillaAgentId */
  mode: "ref" | "identifiers";
  concurrency: number;
};

/**
 * INMOVILLA_DEMAND_FICHA_ENRICH: 0|false desactiva. 1 o vacío: solo si falta refConsultada.
 * 2|identifiers: también si faltan siglas o inmovillaAgentId.
 * INMOVILLA_DEMAND_FICHA_CONCURRENCY: peticiones paralelas (1–8, default 4).
 */
export function readDemandFichaEnrichConfig(): DemandFichaEnrichConfig {
  const raw = process.env.INMOVILLA_DEMAND_FICHA_ENRICH ?? "1";
  if (raw === "0" || raw === "false") {
    return { enabled: false, mode: "ref", concurrency: 4 };
  }
  const mode =
    raw === "2" || raw === "identifiers" ? "identifiers" : "ref";
  const n = Number(process.env.INMOVILLA_DEMAND_FICHA_CONCURRENCY ?? "4");
  const concurrency = Number.isFinite(n) ? Math.min(8, Math.max(1, n)) : 4;
  return { enabled: true, mode, concurrency };
}

function demandNeedsFichaEnrich(
  d: InmovillaDemand,
  mode: DemandFichaEnrichConfig["mode"],
): boolean {
  if (!d.zonas) return true;
  if (mode === "ref") return !d.refConsultada;
  return (
    !d.refConsultada ||
    d.siglas === undefined ||
    d.inmovillaAgentId === undefined
  );
}

function inmovillaDemandFromFieldMap(
  merged: Record<string, unknown>,
): InmovillaDemand {
  const fields = Object.entries(merged).map(([campo, value]) => ({
    campo,
    value,
  }));
  return normalizeDemand({ acciones: [], fields });
}

function mergeFichaFieldsIntoMap(
  listMap: Record<string, unknown>,
  ficha: Record<string, string>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...listMap };
  for (const [k, v] of Object.entries(ficha)) {
    merged[k] = v;
    merged[`demandas-${k}`] = v;
  }
  return merged;
}

async function enrichDemandsWithFichaCliente(
  session: InmovillaSession,
  demands: InmovillaDemand[],
  config: DemandFichaEnrichConfig,
): Promise<InmovillaDemand[]> {
  const toEnrich = demands.filter((d) => demandNeedsFichaEnrich(d, config.mode));
  if (toEnrich.length === 0) return demands;

  console.log(
    `[demands] Enriquecimiento ficha: ${toEnrich.length}/${demands.length} demandas (modo=${config.mode}, concurrencia=${config.concurrency})`,
  );

  const client = createInmovillaClient(session);
  const indexByCodigo = new Map(demands.map((d, i) => [d.codigo, i]));
  const { concurrency } = config;
  let zonesExtracted = 0;

  for (let i = 0; i < toEnrich.length; i += concurrency) {
    const chunk = toEnrich.slice(i, i + concurrency);
    await Promise.all(
      chunk.map(async (demand) => {
        try {
          const fichaResult = await fetchDemandasFichaFull(
            client,
            session,
            demand.codigo,
          );

          const idx = indexByCodigo.get(demand.codigo);
          if (idx === undefined) return;

          if (Object.keys(fichaResult.fields).length > 0) {
            const listMap =
              demand.raw && typeof demand.raw === "object" && !Array.isArray(demand.raw)
                ? (demand.raw as Record<string, unknown>)
                : {};
            const merged = mergeFichaFieldsIntoMap(listMap, fichaResult.fields);

            if (fichaResult.zonasFromAreas) {
              merged["zonas"] = fichaResult.zonasFromAreas;
            }

            const rebuilt = inmovillaDemandFromFieldMap(merged);
            demands[idx] = rebuilt;
          } else if (fichaResult.zonasFromAreas) {
            demands[idx] = {
              ...demand,
              zonas: fichaResult.zonasFromAreas,
            };
          }

          if (fichaResult.zonasFromAreas) zonesExtracted++;
        } catch (err) {
          console.warn(
            `[demands] Ficha cliente falló codigo=${demand.codigo} — se mantiene listado`,
            err instanceof Error ? err.message : err,
          );
        }
      }),
    );
  }

  if (zonesExtracted > 0) {
    console.log(
      `[demands] Zonas extraídas de selpoli: ${zonesExtracted}/${toEnrich.length} demandas`,
    );
  }

  return demands;
}

function buildParamJson(posicion: number): string {
  return JSON.stringify({
    general: {
      info: {
        lostags: `lista_situacion;:;lista;:;lista;:;${ACTIVE_DEMAND_STATES};:;`,
        numvistas: 1,
        ventana: "demandas",
        data: "demresultados",
      },
      filtro: "",
      campo: {
        "demandas.desvioalquiler": { valor: 0 },
        "demandas.desvioventa": { valor: 0 },
      },
      ordentipo: "desc",
    },
    demresultados: {
      info: {
        ficha: "demandas",
        data: "demresultados",
        posicion,
        paginacion: "10",
        jsonvista: "1",
        totalreg: 0,
      },
      orden: false,
    },
  });
}

function normalizeDemand(raw: InmovillaDemandRaw): InmovillaDemand {
  const map: Record<string, unknown> = {};
  for (const f of raw.fields) {
    map[f.campo] = f.value;
  }

  const joinPrefixAndPhone = (prefixValue: unknown, phoneValue: unknown): string => {
    const prefix = String(prefixValue ?? "").replace(/\D/g, "");
    const phone = String(phoneValue ?? "").replace(/\D/g, "");
    if (!phone || phone.length < 7) return "";
    if (!prefix) return phone;
    return `${prefix}${phone}`;
  };

  // keyagente, keycomercial y userid son todos el ID numérico del agente en Inmovilla.
  // Tomamos el primero que sea un número entero válido.
  const rawAgentId =
    map["keyagente"] ?? map["keycomercial"] ?? map["userid"] ?? null;
  const parsedAgentId =
    rawAgentId !== null && rawAgentId !== ""
      ? Number(rawAgentId)
      : NaN;
  const inmovillaAgentId = Number.isFinite(parsedAgentId) && parsedAgentId > 0
    ? parsedAgentId
    : undefined;

  const rawSiglas = map["siglas"];
  const siglas =
    typeof rawSiglas === "string" && rawSiglas.trim()
      ? rawSiglas.trim().toUpperCase()
      : undefined;

  const refConsultada = extractRefConsultadaFromDemandMap(map);

  // Teléfono del comprador con prefijo de país.
  // Preferimos el móvil (telefono2_raw). Fallback a fijo (telefono1_raw).
  // Si _raw no viene, reconstruimos con prefijo + número (prefijotel* + telefono*).
  // Solo usamos valores con al menos 7 dígitos para evitar capturar prefijo suelto.
  const rawTel2 = String(map["telefono2_raw"] ?? "").trim();
  const rawTel1 = String(map["telefono1_raw"] ?? "").trim();
  const composedTel2 = joinPrefixAndPhone(map["prefijotel2"], map["telefono2"]);
  const composedTel1 = joinPrefixAndPhone(map["prefijotel1"], map["telefono1"]);
  const plainTel2 = String(map["telefono2"] ?? "").replace(/\D/g, "");
  const plainTel1 = String(map["telefono1"] ?? "").replace(/\D/g, "");

  const candidates = [
    rawTel2,
    composedTel2,
    plainTel2,
    rawTel1,
    composedTel1,
    plainTel1,
  ].map((v) => String(v).trim());

  const bestPhone = candidates.find((value) => value.replace(/\D/g, "").length >= 7);
  const telefono =
    bestPhone && bestPhone.replace(/\D/g, "").length >= 7
      ? bestPhone
      : undefined;

  return {
    codigo: String(map["codigo"] ?? map["cod_dem"] ?? map["keydem"] ?? ""),
    ref: String(map["ref"] ?? map["numdemanda"] ?? ""),
    nombre: String(map["nombre"] ?? map["nomcli"] ?? map["cliente"] ?? ""),
    estadoId: String(
      map["keysitu"] ?? map["key_situ"] ?? map["idsitu"] ?? "",
    ),
    estadoNombre: String(
      map["lissitu"] ?? map["situacion"] ?? map["estado"] ?? "",
    ),
    presupuestoMin: Number(
      map["ventadesde"] ?? map["demanda_ventadesde"] ?? 0,
    ),
    presupuestoMax: Number(
      map["ventahasta"] ?? map["demanda_ventahasta"] ?? 0,
    ),
    habitacionesMin: Number(map["habitacionmin"] ?? 0),
    tipos: String(map["tipopropiedad"] ?? map["tipos"] ?? ""),
    zonas: String(map["zonas"] ?? map["zona"] ?? ""),
    fechaActualizacion: String(
      map["fechaact"] ?? map["demandas-fechaact"] ?? "",
    ),
    agente: String(map["usernombre"] ?? map["agente"] ?? ""),
    siglas,
    inmovillaAgentId,
    refConsultada,
    telefono,
    raw: map,
  };
}

export async function fetchAllDemands(
  session: InmovillaSession,
  options?: { fichaEnrich?: DemandFichaEnrichConfig },
): Promise<InmovillaDemand[]> {
  const client = createInmovillaClient(session);
  const all: InmovillaDemand[] = [];
  let posicion = 0;
  let pageSize = 10;
  let skippedRecords = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const paramjson = buildParamJson(posicion);
    const pageNum = Math.floor(posicion / pageSize) + 1;
    console.log(
      `[demands] Leyendo página ${pageNum} (posición ${posicion})...`,
    );

    const data = await client.post<unknown>(PAGINATION_PATH, { paramjson });

    const { info, rawRecords } = validatePaginationResponse(data);
    pageSize = Number(info.paginacion) || 10;

    for (const rawEntry of rawRecords) {
      const validated = validateDemandRecord(rawEntry);
      if (!validated) {
        skippedRecords++;
        console.warn(
          `[demands] Registro inválido en página ${pageNum} — omitido`,
          { posicion },
        );
        continue;
      }
      all.push(normalizeDemand(validated as InmovillaDemandRaw));
    }

    if (rawRecords.length < pageSize) break;
    posicion += pageSize;
  }

  if (skippedRecords > 0) {
    console.warn(
      `[demands] ${skippedRecords} registro(s) omitidos por validación inválida`,
    );
  }

  const enrichCfg = options?.fichaEnrich ?? readDemandFichaEnrichConfig();
  if (enrichCfg.enabled) {
    await enrichDemandsWithFichaCliente(session, all, enrichCfg);
  }

  return all;
}
