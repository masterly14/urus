import type { InmovillaSession } from "../auth/types";
import { createInmovillaClient } from "./client";
import { createInmovillaRestClient } from "../rest/client";
import { getClient, searchClient } from "../rest/clients";
import type { Cliente } from "../rest/types";
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

export type DemandPhoneReconcileConfig = {
  enabled: boolean;
  maxLookups: number;
  delayMs: number;
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

/**
 * Reconciliación de teléfono por REST v1:
 * - Solo se ejecuta para demandas cuyo listado legacy no trae telefono1/2.
 * - Consulta clientes por keycli y, si no hay teléfono, busca por email.
 * - Por defecto se limita a 20 demandas por ciclo y 3500ms entre llamadas para
 *   respetar el límite documentado de clientes (20/min) sin alargar demasiado
 *   el cron de ingesta.
 */
export function readDemandPhoneReconcileConfig(): DemandPhoneReconcileConfig {
  const raw = process.env.INMOVILLA_DEMAND_PHONE_RECONCILE ?? "1";
  const token = process.env.INMOVILLA_API_TOKEN?.trim();
  if (!token || raw === "0" || raw === "false") {
    return { enabled: false, maxLookups: 0, delayMs: 0 };
  }

  const maxLookupsRaw = Number(process.env.INMOVILLA_DEMAND_PHONE_RECONCILE_MAX ?? "20");
  const delayRaw = Number(process.env.INMOVILLA_DEMAND_PHONE_RECONCILE_DELAY_MS ?? "3500");

  return {
    enabled: true,
    maxLookups: Number.isFinite(maxLookupsRaw)
      ? Math.min(50, Math.max(0, Math.floor(maxLookupsRaw)))
      : 20,
    delayMs: Number.isFinite(delayRaw) ? Math.max(0, Math.floor(delayRaw)) : 3500,
  };
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function digits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function joinPrefixAndPhone(prefixValue: unknown, phoneValue: unknown): string {
  const prefix = digits(prefixValue);
  const phone = digits(phoneValue);
  if (!phone || phone.length < 7) return "";
  if (!prefix) return phone;
  return `${prefix}${phone}`;
}

function firstUsablePhone(candidates: unknown[]): string | undefined {
  return candidates
    .map(digits)
    .find((value) => value.length >= 7);
}

function phoneFromCliente(cliente: Cliente): string | undefined {
  return firstUsablePhone([
    joinPrefixAndPhone(cliente.prefijotel2, cliente.telefono2),
    joinPrefixAndPhone(cliente.prefijotel1, cliente.telefono1),
    joinPrefixAndPhone(cliente.prefijotel3, cliente.telefono3),
    cliente.telefono2,
    cliente.telefono1,
    cliente.telefono3,
  ]);
}

function firstCliente(value: Cliente | Cliente[] | null | undefined): Cliente | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function legacyDemandKeycli(demand: InmovillaDemand): number | null {
  const raw = demand.raw ?? {};
  const value = raw.keycli ?? raw["clientes-cod_cli"] ?? raw.cod_cli;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function legacyDemandEmail(demand: InmovillaDemand): string | null {
  const raw = demand.raw ?? {};
  const value = raw.email ?? raw["clientes-email"];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function reconcileDemandPhonesFromRest(
  demands: InmovillaDemand[],
  config: DemandPhoneReconcileConfig,
): Promise<InmovillaDemand[]> {
  if (!config.enabled || config.maxLookups <= 0) return demands;

  const missing = demands.filter((d) => !d.telefono);
  if (missing.length === 0) return demands;

  const toLookup = missing
    .filter((d) => legacyDemandKeycli(d) !== null || legacyDemandEmail(d) !== null)
    .slice(0, config.maxLookups);

  if (toLookup.length === 0) return demands;

  console.log(
    `[demands] Reconciliando teléfonos vía REST clientes: ${toLookup.length}/${missing.length} demandas sin teléfono (delay=${config.delayMs}ms)`,
  );

  const rest = createInmovillaRestClient();
  const indexByCodigo = new Map(demands.map((d, i) => [d.codigo, i]));
  let recovered = 0;

  for (const demand of toLookup) {
    if (config.delayMs > 0) await delay(config.delayMs);

    try {
      let source = "";
      let phone: string | undefined;
      const keycli = legacyDemandKeycli(demand);

      if (keycli !== null) {
        const cliente = firstCliente(await getClient(rest, keycli));
        if (cliente) {
          phone = phoneFromCliente(cliente);
          if (phone) source = "rest:clientes:cod_cli";
        }
      }

      if (!phone) {
        const email = legacyDemandEmail(demand);
        if (email) {
          if (config.delayMs > 0) await delay(config.delayMs);
          const matches = await searchClient(rest, { email });
          const cliente = matches.find((c) => String(c.cod_cli) === String(keycli))
            ?? matches[0];
          if (cliente) {
            phone = phoneFromCliente(cliente);
            if (phone) source = "rest:clientes:buscar-email";
          }
        }
      }

      if (!phone) continue;

      const idx = indexByCodigo.get(demand.codigo);
      if (idx === undefined) continue;

      demands[idx] = {
        ...demand,
        telefono: phone,
        raw: {
          ...(demand.raw ?? {}),
          telefono_reconciliado: phone,
          telefono_reconciliado_fuente: source,
        },
      };
      recovered++;
    } catch (err) {
      console.warn(
        `[demands] Reconciliación teléfono falló codigo=${demand.codigo} — se mantiene listado`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (recovered > 0) {
    console.log(`[demands] Teléfonos recuperados vía REST clientes: ${recovered}/${toLookup.length}`);
  }

  return demands;
}

function normalizeDemand(raw: InmovillaDemandRaw): InmovillaDemand {
  const map: Record<string, unknown> = {};
  for (const f of raw.fields) {
    map[f.campo] = f.value;
  }

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
  const plainTel2 = digits(map["telefono2"]);
  const plainTel1 = digits(map["telefono1"]);

  const telefono = firstUsablePhone([
    rawTel2,
    composedTel2,
    plainTel2,
    rawTel1,
    composedTel1,
    plainTel1,
  ]);

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
  options?: {
    fichaEnrich?: DemandFichaEnrichConfig;
    phoneReconcile?: DemandPhoneReconcileConfig;
  },
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

  const phoneReconcileCfg = options?.phoneReconcile ?? readDemandPhoneReconcileConfig();
  if (phoneReconcileCfg.enabled) {
    await reconcileDemandPhonesFromRest(all, phoneReconcileCfg);
  }

  return all;
}
