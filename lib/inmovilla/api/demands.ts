import type { InmovillaSession } from "../auth/types";
import { createInmovillaClient } from "./client";
import type {
  InmovillaDemand,
  InmovillaDemandRaw,
  InmovillaDemandPaginationResponse,
} from "./types-demands";

const PAGINATION_PATH = "/new/app/api/v1/paginacion/";
const ACTIVE_DEMAND_STATES = "20,23,26,31";

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
    raw: map,
  };
}

export async function fetchAllDemands(
  session: InmovillaSession,
): Promise<InmovillaDemand[]> {
  const client = createInmovillaClient(session);
  const all: InmovillaDemand[] = [];
  let posicion = 0;
  let pageSize = 10;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const paramjson = buildParamJson(posicion);
    console.log(
      `[demands] Leyendo página ${Math.floor(posicion / pageSize) + 1} (posición ${posicion})...`,
    );

    const data = await client.post<InmovillaDemandPaginationResponse>(
      PAGINATION_PATH,
      { paramjson },
    );

    const resultado = data?.demandas?.demresultados;
    if (!resultado) {
      throw new Error(
        "Respuesta inesperada: no se encontró demandas.demresultados",
      );
    }

    pageSize = Number(resultado.info.paginacion) || 10;
    const datos = Array.isArray(resultado.datos) ? resultado.datos : [];

    for (const raw of datos) {
      all.push(normalizeDemand(raw));
    }

    if (datos.length < pageSize) break;
    posicion += pageSize;
  }

  return all;
}
