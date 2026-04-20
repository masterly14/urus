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
import { createInmovillaRestClient } from "@/lib/inmovilla/rest";
import { safeUpdateProperty } from "@/lib/inmovilla/rest/safe-update";

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
      const parsed = json as Record<string, unknown>;
      const msg =
        (typeof parsed?.mensaje === "string" && parsed.mensaje) ||
        (typeof parsed?.message === "string" && parsed.message) ||
        (typeof parsed?.errors === "string" && parsed.errors) ||
        JSON.stringify(parsed).slice(0, 5000) ||
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

function resolveTituloes(params: CreateProspectoParams): string {
  const fromParam = typeof params.tituloes === "string" ? params.tituloes.trim() : "";
  if (fromParam.length > 0) return fromParam;
  const seedRaw = params.seedRaw ?? {};
  if (typeof seedRaw.tituloes === "string" && seedRaw.tituloes.trim()) {
    return seedRaw.tituloes.trim();
  }
  if (typeof seedRaw.titulo === "string" && seedRaw.titulo.trim()) {
    return seedRaw.titulo.trim();
  }
  const calle = (params.calle ?? "").trim();
  return calle.length > 0 ? `Prospecto ${calle}` : "Prospecto";
}

function resolveDescripciones(params: CreateProspectoParams): string {
  const fromParam =
    typeof params.descripciones === "string" ? params.descripciones.trim() : "";
  if (fromParam.length > 0) return fromParam;
  const seedRaw = params.seedRaw ?? {};
  if (typeof seedRaw.descripciones === "string" && seedRaw.descripciones.trim()) {
    return seedRaw.descripciones.trim();
  }
  // Fallback mínimo para que la ficha no tenga descripción en blanco (la UI
  // del CRM hace `.indexOf()` sobre este campo sin defensa ante undefined).
  return resolveTituloes(params);
}

function buildCreatePayload(params: CreateProspectoParams): Record<string, unknown> {
  // Defaults observados en fichas válidas de Inmovilla.
  const alqindex = String(params.alqindex ?? "0.00");
  const alqinferior = String(params.alqinferior ?? "0.00");
  const alqsuperior = String(params.alqsuperior ?? "0.00");
  const conservacion = Number(params.conservacion ?? 20);
  const keysuelo = Number(params.keysuelo ?? 0);
  const keycarpin = Number(params.keycarpin ?? 0);
  const keycarpinext = Number(params.keycarpinext ?? 0);
  const todoext = Number(params.todoext ?? 0);
  const keyagua = Number(params.keyagua ?? 0);
  const keycalefa = Number(params.keycalefa ?? 0);
  const seedRaw = params.seedRaw ?? {};
  const seedCharacteristics =
    typeof seedRaw.characteristics === "object" && seedRaw.characteristics !== null
      ? (seedRaw.characteristics as Record<string, unknown>)
      : {};
  const flatScalarSeed = Object.fromEntries(
    Object.entries(seedRaw).filter(([, value]) =>
      typeof value === "string" || typeof value === "number" || typeof value === "boolean",
    ),
  );
  const tituloes = resolveTituloes(params);
  const descripciones = resolveDescripciones(params);

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
    ...seedRaw,
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
      alqindex,
      alqinferior,
      alqsuperior,
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
      conservacion,
      keysuelo,
      keycarpin,
      keycarpinext,
      alqindex,
      alqinferior,
      alqsuperior,
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
    characteristics: {
      ...flatScalarSeed,
      ...seedCharacteristics,
      conservacion,
      keysuelo,
      keycarpin,
      keycarpinext,
      todoext,
      keyagua,
      keycalefa,
    },
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
    tituloes,
    descripciones,
    // Compatibilidad defensiva con validadores legacy del backend CRM.
    conservacion,
    keysuelo,
    keycarpin,
    keycarpinext,
    alqindex,
    alqinferior,
    alqsuperior,
    todoext,
    keyagua,
    keycalefa,
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

  // El endpoint CRM v2 crea el prospecto pero NO persiste tituloes/descripciones
  // aunque los mandemos en el payload. Si quedan vacíos, la UI del CRM rompe
  // con "Cannot read properties of undefined (reading 'indexOf')" al abrir la
  // ficha. Parcheamos vía REST v1 (token estático) que sí persiste esos campos.
  const tituloes = resolveTituloes(params);
  const descripciones = resolveDescripciones(params);
  await patchTitulosViaRest(response, tituloes, descripciones);

  return response;
}

/**
 * Parche post-create: usa la REST v1 para fijar tituloes/descripciones en la
 * ficha recién creada. Tolerante a fallos: si el parche no se puede aplicar
 * (p.ej. no hay token o la API rechaza el update), no aborta la creación
 * porque el prospecto ya existe en Inmovilla.
 */
async function patchTitulosViaRest(
  created: CreateProspectoResponse,
  tituloes: string,
  descripciones: string,
): Promise<void> {
  const token = process.env.INMOVILLA_API_TOKEN;
  if (!token) {
    console.warn(
      "[crm-v2] INMOVILLA_API_TOKEN no configurado; no se parcheará tituloes/descripciones vía REST v1.",
    );
    return;
  }

  const ref = created.mainData?.ref;
  const codOfer = created.cod_ofer;
  if (!ref && !codOfer) {
    console.warn(
      "[crm-v2] create response sin ref ni cod_ofer; no se puede parchear tituloes.",
    );
    return;
  }

  try {
    const restClient = createInmovillaRestClient({ token });
    const patch: Record<string, unknown> = {
      tituloes,
      descripciones,
    };
    const result = await safeUpdateProperty(
      restClient,
      { codOfer, ref },
      patch,
      {
        logger: {
          log: (m) => console.log(`[crm-v2→rest] ${m}`),
          warn: (m) => console.warn(`[crm-v2→rest] ${m}`),
        },
      },
    );
    if (result.ok) {
      const removed =
        result.removedFields.length > 0
          ? ` (campos descartados: ${result.removedFields.join(", ")})`
          : "";
      console.log(
        `[crm-v2→rest] Parche tituloes/descripciones OK para ref=${result.payload.ref}${removed}.`,
      );
    }
  } catch (err) {
    // Warning, no error: el prospecto ya fue creado; solo falló el parche.
    console.warn(
      `[crm-v2→rest] Falló el parche de tituloes/descripciones para cod_ofer=${codOfer} ref=${ref}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
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
