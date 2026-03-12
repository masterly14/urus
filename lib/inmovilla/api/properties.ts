import type { InmovillaSession } from "../auth/types";
import { createInmovillaClient } from "./client";
import type {
  InmovillaProperty,
  InmovillaPropertyRaw,
  InmovillaPaginationResponse,
} from "./types";

const PAGINATION_PATH = "/new/app/api/v1/paginacion/";
const ACTIVE_STATES = "1,7,18,40,41";

function buildParamJson(posicion: number): string {
  return JSON.stringify({
    general: {
      info: {
        lostags: `lista_disponibilidad;:;lista;:;lista;:;${ACTIVE_STATES};:;`,
        numvistas: 1,
        ventana: "cofe",
        data: "oferesultados",
      },
      param: {
        soloRefSearch: "1",
        noSoloRefSearch: "0",
        tiporev: "0",
        verValoraPropietarios: 1,
        fechaalta: "1",
        fechaact: "0",
        fechaexclualta: "1",
        fechaexclubaja: "0",
      },
      filtro: "",
      campo: {
        "ofertas.patio": { valor: "0" },
        "ofertas.salida_humos": { valor: "0" },
      },
    },
    oferesultados: {
      info: {
        ficha: "cofe",
        data: "oferesultados",
        posicion,
        jsonvista: "1",
        totalreg: 0,
      },
      ordentipo: false,
      orden: false,
    },
  });
}

function normalizeProperty(raw: InmovillaPropertyRaw): InmovillaProperty {
  const map: Record<string, unknown> = {};
  for (const f of raw.fields) {
    map[f.campo] = f.value;
  }

  const tituloObj = map["titulo"] as
    | { titulo_1?: string }
    | string
    | undefined;
  const titulo =
    typeof tituloObj === "object" && tituloObj !== null
      ? (tituloObj.titulo_1 ?? "")
      : String(tituloObj ?? "");

  return {
    codigo: String(map["codigo"] ?? map["cod_ofer"] ?? ""),
    ref: String(map["ref"] ?? ""),
    titulo,
    tipoOfer: String(map["tipo_ofer"] ?? ""),
    precio: Number(map["precioinmo"] ?? 0),
    metrosConstruidos: Number(map["m_cons"] ?? 0),
    habitaciones: Number(map["habitaciones"] ?? 0),
    banyos: Number(map["banyos"] ?? 0),
    ciudad: String(map["ciudad"] ?? ""),
    zona: String(map["zona"] ?? ""),
    estado: String(map["lisestado"] ?? ""),
    fechaAlta: String(map["fecha"] ?? ""),
    fechaActualizacion: String(map["fechaact"] ?? ""),
    numFotos: Number(map["numfotos"] ?? 0),
    agente: String(map["usernombre"] ?? ""),
    raw: map,
  };
}

export async function fetchAllProperties(
  session: InmovillaSession,
): Promise<InmovillaProperty[]> {
  const client = createInmovillaClient(session);
  const all: InmovillaProperty[] = [];
  let posicion = 0;
  let pageSize = 10;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const paramjson = buildParamJson(posicion);

    console.log(
      `[properties] Leyendo página ${Math.floor(posicion / pageSize) + 1} (posición ${posicion})...`,
    );

    const data = await client.post<InmovillaPaginationResponse>(
      PAGINATION_PATH,
      { paramjson, verValoraPropietarios: "1" },
    );

    const resultado = data?.cofe?.oferesultados;
    if (!resultado) {
      throw new Error(
        "Respuesta inesperada: no se encontró cofe.oferesultados",
      );
    }

    pageSize = Number(resultado.info.paginacion) || 10;
    const datos = Array.isArray(resultado.datos) ? resultado.datos : [];

    for (const raw of datos) {
      all.push(normalizeProperty(raw));
    }

    if (datos.length < pageSize) break;
    posicion += pageSize;
  }

  return all;
}
