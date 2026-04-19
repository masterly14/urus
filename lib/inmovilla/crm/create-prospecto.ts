/**
 * CRM v2 API — create prospecto + statusChange.
 * Uses InmovillaSession cookies (JWT) to auth against crm.inmovilla.com.
 */

import type { InmovillaSession } from "@/lib/inmovilla/auth/types";
import type {
  CreateProspectoParams,
  CreateProspectoResponse,
  StatusChangePayload,
} from "./types";

const CRM_BASE = "https://crm.inmovilla.com";
const TIMEOUT_MS = 30_000;

function buildCookieHeader(session: InmovillaSession): string {
  return session.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

async function crmRequest<T>(
  session: InmovillaSession,
  method: "POST" | "PUT",
  path: string,
  body: unknown,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${CRM_BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "x-use-jwt-cookie": "true",
        Cookie: buildCookieHeader(session),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(
        `CRM v2 ${method} ${path}: non-JSON response (${res.status}): ${text.slice(0, 200)}`,
      );
    }

    if (!res.ok) {
      const msg =
        (json as Record<string, unknown>)?.mensaje ??
        (json as Record<string, unknown>)?.message ??
        text.slice(0, 200);
      throw new Error(`CRM v2 ${method} ${path}: ${res.status} — ${msg}`);
    }

    return json as T;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Build the full create payload with sensible defaults
// ---------------------------------------------------------------------------

function buildCreatePayload(params: CreateProspectoParams): Record<string, unknown> {
  const cadastreEntry: Record<string, unknown> = {
    id: -1,
    rnumero: "",
    rnumeroinscr: "",
    rletra: "",
    rtomo: "",
    rlibro: "",
    rfolio: "",
    registrod: "",
    rcatastral: params.referenciaCatastral ?? "",
    valorcastral: "",
    rdirfinca: "",
    valcatastralsuelo: "",
    valcatastralconstruccion: "",
    valcatastralano: "",
    preciovrm: "",
    superficie: "",
    uso: "",
    coef_participacion: "",
  };

  return {
    location: {
      key_loca: params.key_loca,
      key_zona: params.key_zona,
      idArea: 0,
      zonaauxiliar: "",
      keycalle: 0,
      calle: params.calle,
      numero: params.numero,
      cp: params.cp,
      cp_ext: "",
      altura: "",
      planta: params.planta ?? "",
      piso: 0,
      escalera: "",
      puerta: "",
      bloque: "",
      edificio: "",
      distmar: 0,
      keyori: 0,
      keyvista: 0,
      numplanta: 0,
      latitud: params.latitud ?? 0,
      altitud: params.altitud ?? 0,
      cadastre: params.referenciaCatastral ? [cadastreEntry] : [],
      country: "",
      keycountry: params.keycountry ?? 724,
      province: "",
      keyprov: 0,
    },
    surfaces: {
      m_uties: 0,
      m_cons: params.m_cons,
      m_parcela: 0,
      mtfachada: 0,
      mtpuerta: 0,
      m_pplanta: 0,
      m_pb: 0,
      m_sotano: 0,
      alturamin: 0,
      alturatecho: 0,
    },
    mainData: {
      cod_ofer: "NEW",
      numagencia: params.numagencia,
      fecha: "",
      fechaact: "",
      key_tipo: params.key_tipo,
      exclu: false,
      alta_exclusiva: "",
      baja_exclusiva: "",
      soyprospecto: 1,
      estadoficha: 0,
      nodisponible: 0,
      idSubEstado: 0,
      idEstado: 0,
      estado: "",
      subEstado: "",
    },
    operation: {
      keyacci: params.keyacci,
      preciotraspaso: 0,
      precio: 0,
      porcen: 0,
      comision: 0,
      porceniva: 0,
      precioiva: 0,
      precioinmo: params.precioinmo,
      outlet: 0,
      tasar: 0,
      valorfiscal: 0,
      aconsultar: false,
      precioalq: params.precioalq,
      tipomensual: "MES",
      sincomision: 0,
      comunidadincluida: false,
      opcioncompra: false,
      calefaccion_inc: false,
      mascotas: false,
      actividad_comercial: 0,
      tipo_terreno: 0,
    },
    rooms: {
      habdobles: 0,
      habitaciones: params.habitaciones,
      banyos: params.banyos,
      aseos: 0,
      salon: 0,
      m_terraza: "0.00",
      m_cocina: "0.00",
      m_comedor: "0.00",
      m_salon: "0.00",
      m_patio: 0,
      m_buhardilla: "0.00",
      m_altillo: "0.00",
      propertyRooms: [],
    },
    internalData: {
      numllave: "",
      keyagente: params.keyagente,
      keycolaborador: 0,
      referenciacol: "",
      captadopor: params.keyagente,
      keymedio: params.keymedio ?? 12,
      numsucursal: params.numagencia,
      numagencia: params.numagencia,
      prioridadofe: 0,
      reftemporada: "",
      haycartel: false,
      interesan: false,
      interesante: false,
      entidadbancaria: false,
      keycli: params.keycli,
      tinterior: null,
      msjavisoofe: null,
      msjavisoofemls: null,
      observacionofe: null,
      cuandovisitarofe: null,
      dondequedarofe: null,
      urlprospecto: null,
    },
    otherData: {
      antiguedad: 0,
      gastos_com: 0,
      tgascom: 0,
      ibi: 0,
      nplazasparking: 0,
      numapar: "0",
      numpuesto: 0,
      tipovpo: 6,
      x_opciones: 0,
      energiarecibido: 0,
      energialetra: "",
      energiavalor: 0,
      emisionesletra: "",
      emisionesvalor: 0,
      refcertificado: "",
      fecha_caducidad: "0000-00-00",
      motivoventa: 0,
      cedula_habitabilidad: false,
      informe_ite: false,
      certificado_aptitud: false,
      fecha_calificacion: "0000-00-00",
      precio_maximo: 0,
      tanteo: false,
      referencia_vpo: "",
      num_contrato: "",
      fecha_contrato_ini: "0000-00-00",
      fecha_contrato_fin: "0000-00-00",
      valor_referencia: 0,
      en_escaparate: false,
      renovacion_automatica: false,
      cartel_particular: false,
      parte_visita: false,
      tenemos_contrato: false,
      pendingtasks: 0,
      keypromo: 0,
      propertyValuation: [],
      agencySlogan: [{ idioma: 1, slogan: "", countText: 0 }],
      agentSharedInfo: null,
    },
    additionalFields: {
      libreta_catastral_articulo_matricial: "",
      libreta_catastral_matriz_catastral: "",
      libreta_catastral_fraccion: "",
      libreta_catastral_localidad: "",
      libreta_catastral_fecha_caducidad: "0000-00-00",
      datos_venta_rentedyieldpercentage: 0,
      caracteristicas_areabuildable: 0,
      caracteristicas_areatradableminimum: 0,
      caracteristicas_garageprice: 0,
      caracteristicas_parkingprice: 0,
    },
    customFields: [],
    customQualities: [],
    characteristics: {},
    sharing: { mls: false, cesioncom: 0, mls_comentario: "", circles: [] },
    dataDescription: { data: [] },
    descriptions: [],
    publish: {
      eninternet: "0",
      vercalle: 0,
      destacado: 0,
      portals: [],
      idealista: {
        porcentaje_calidad: 0,
        cruces_idealista: 0,
        enlaceDestacado: "",
        enlaces: [],
        idealista_id: "",
        tieneIdealista: false,
        estadoLabel: "No Publicado",
        estado: "no_publicado",
      },
    },
    owners: [],
    root: false,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function createProspecto(
  session: InmovillaSession,
  params: CreateProspectoParams,
): Promise<CreateProspectoResponse> {
  const payload = buildCreatePayload(params);

  console.log(
    `[crm-v2] Creating prospecto: key_loca=${params.key_loca}, key_tipo=${params.key_tipo}`,
  );

  const response = await crmRequest<CreateProspectoResponse>(
    session,
    "POST",
    "/new/app/api/v2/properties/create",
    payload,
  );

  console.log(
    `[crm-v2] Prospecto created: cod_ofer=${response.cod_ofer}`,
  );

  return response;
}

export async function changeProspectoStatus(
  session: InmovillaSession,
  codOfer: number,
  payload: StatusChangePayload,
): Promise<void> {
  console.log(
    `[crm-v2] Changing status for ${codOfer}: estado=${payload.estado}, subEstado=${payload.subEstado}`,
  );

  await crmRequest(
    session,
    "PUT",
    `/new/app/api/v2/properties/statusChange/${codOfer}`,
    payload,
  );

  console.log(`[crm-v2] Status changed for ${codOfer}`);
}
