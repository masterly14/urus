/**
 * Funciones de alto nivel para propiedades (API REST v1 Inmovilla).
 * Usan el cliente creado con createInmovillaRestClient().
 */

import type { InmovillaRestClient } from "./client";
import type {
  PropiedadListadoItem,
  PropiedadCompleta,
  CreatePropertyPayload,
  CreatePropertyResponse,
  ExtraInfoResponse,
  ExtraInfoPublishInfo,
  ExtraInfoPublishEntry,
} from "./types";
import type { InmovillaProperty } from "@/lib/inmovilla/api/types";
import type { EnumLookupMaps } from "./enum-lookup";
import { buildMainPhotoUrlFromRaw } from "./photo-url";
import { normalizeCadastralRef } from "@/lib/nota-encargo/cadastral-ref";

/**
 * Obtiene el listado de propiedades/prospectos ordenado por fecha de actualización.
 * GET /propiedades/?listado
 */
export async function fetchPropertyList(
  client: InmovillaRestClient,
): Promise<PropiedadListadoItem[]> {
  const data = await client.get<PropiedadListadoItem[]>("/propiedades/", {
    listado: true,
  });
  return Array.isArray(data) ? data : [];
}

/**
 * Obtiene una propiedad por código de oferta.
 * GET /propiedades/?cod_ofer={cod_ofer}
 */
export async function getProperty(
  client: InmovillaRestClient,
  cod_ofer: number | string,
): Promise<PropiedadCompleta | null> {
  const data = await client.get<PropiedadCompleta>("/propiedades/", {
    cod_ofer: String(cod_ofer),
  });
  if (data == null || typeof data !== "object") return null;
  return data as PropiedadCompleta;
}

/**
 * Convierte la respuesta REST (PropiedadCompleta) al formato InmovillaProperty del worker.
 * Fuerza todos los campos a sus tipos esperados por Prisma (String/Number).
 *
 * Si se pasan `enumMaps`, resuelve key_loca → nombre de ciudad, key_zona → nombre
 * de zona y estadoficha → etiqueta legible desde los catálogos de Neon.
 */
export function normalizePropertyFromRest(
  raw: PropiedadCompleta,
  enumMaps?: EnumLookupMaps,
): InmovillaProperty {
  const isNodisponible = raw.nodisponible === true || raw.nodisponible === 1;
  const isProspecto = raw.prospecto === true;

  const keyLoca = typeof raw.key_loca === "number" ? raw.key_loca : undefined;
  const keyZona = typeof raw.key_zona === "number" ? raw.key_zona : undefined;

  const ciudadText =
    (raw.localidad ? String(raw.localidad).trim() : "") ||
    (raw.ciudad ? String(raw.ciudad).trim() : "") ||
    (keyLoca != null && enumMaps ? (enumMaps.ciudadByKeyLoca.get(keyLoca) ?? "") : "");

  const zonaText =
    (raw.zona && typeof raw.zona === "string" ? raw.zona.trim() : "") ||
    (keyLoca != null && keyZona != null && enumMaps
      ? (enumMaps.zonaByLocaZona.get(`${keyLoca}:${keyZona}`) ?? "")
      : "");

  const estadoFicha =
    typeof raw.estadoficha === "number" ? raw.estadoficha : undefined;
  const estadoLabel =
    (estadoFicha != null && enumMaps
      ? enumMaps.estadoByValue.get(estadoFicha)
      : undefined) ??
    (raw.lisestado ? String(raw.lisestado) : undefined) ??
    (isNodisponible ? "No disponible" : "Disponible");

  return {
    codigo: raw.cod_ofer != null ? String(raw.cod_ofer) : "",
    ref: String(raw.ref ?? ""),
    refCatastral: raw.rcatastral
      ? normalizeCadastralRef(String(raw.rcatastral))
      : null,
    titulo: String(raw.tituloes ?? raw.descripciones ?? ""),
    tipoOfer:
      (raw.key_tipo != null && enumMaps
        ? enumMaps.tipoByKeyTipo.get(Number(raw.key_tipo)) ?? String(raw.key_tipo)
        : raw.key_tipo != null
          ? String(raw.key_tipo)
          : ""),
    precio: Number(raw.precioinmo ?? raw.precio ?? 0),
    metrosConstruidos: Number(raw.m_cons ?? 0),
    habitaciones: Number(raw.habitaciones ?? 0),
    banyos: Number(raw.banyos ?? 0),
    ciudad: ciudadText,
    zona: zonaText,
    estado: estadoLabel,
    nodisponible: isNodisponible,
    prospecto: isProspecto,
    fechaAlta: String(raw.fecha ?? ""),
    fechaActualizacion: String(raw.fechaact ?? ""),
    numFotos: Number(raw.numfotos ?? 0),
    agente: String(raw.usernombre ?? raw.keyagente ?? ""),
    mainPhotoUrl: buildMainPhotoUrlFromRaw(raw as Record<string, unknown>),
    raw: raw as Record<string, unknown>,
  };
}

/**
 * Obtiene la información extra (publicación en portales + leads) de una propiedad.
 * GET /propiedades/?extrainfo&cod_ofer={cod_ofer}
 *
 * Cuenta como 1 petición contra el rate limit de propiedades (5/min efectivo).
 * La doc sugiere que puede venir como array; toleramos ambos formatos.
 */
export async function getPropertyExtraInfo(
  client: InmovillaRestClient,
  cod_ofer: number | string,
): Promise<ExtraInfoResponse | null> {
  const data = await client.get<unknown>("/propiedades/", {
    extrainfo: true,
    cod_ofer: String(cod_ofer),
  });

  if (data == null) return null;

  if (Array.isArray(data)) {
    const merged: ExtraInfoResponse = {};
    for (const entry of data) {
      if (entry && typeof entry === "object") {
        Object.assign(merged, entry as ExtraInfoResponse);
      }
    }
    return merged;
  }

  if (typeof data === "object") {
    return data as ExtraInfoResponse;
  }

  return null;
}

/**
 * Orden canónico de prioridad cuando hay varios portales con URL de anuncio.
 * Idealista es el portal principal del producto; los demás son fallback.
 */
export const PORTAL_PRIORITY: readonly string[] = [
  "idealista",
  "fotocasa",
  "pisoscom",
  "habitaclia",
];

export type PrimaryPortalResult = {
  portalName: string;
  portalUrl: string;
  state?: string | number;
};

/**
 * De un `publishinfo`, devuelve el portal con `publication_url` válida con la
 * mayor prioridad (Idealista > Fotocasa > Pisos.com > Habitaclia > otros).
 * Devuelve `null` si ningún portal tiene URL.
 */
export function selectPrimaryPortal(
  publishinfo: ExtraInfoPublishInfo | undefined | null,
): PrimaryPortalResult | null {
  if (!publishinfo || typeof publishinfo !== "object") return null;

  const pickUrl = (entry: ExtraInfoPublishEntry): string | null => {
    const url = entry?.publication_url;
    if (typeof url === "string" && url.trim().length > 0) return url.trim();
    return null;
  };

  for (const portal of PORTAL_PRIORITY) {
    const entry = publishinfo[portal];
    if (!entry) continue;
    const url = pickUrl(entry);
    if (url) return { portalName: portal, portalUrl: url, state: entry.state };
  }

  for (const [portal, entry] of Object.entries(publishinfo)) {
    const url = pickUrl(entry);
    if (url) return { portalName: portal, portalUrl: url, state: entry.state };
  }

  return null;
}

/**
 * Crea una propiedad o prospecto.
 * POST /propiedades/
 */
export async function createProperty(
  client: InmovillaRestClient,
  data: CreatePropertyPayload,
): Promise<CreatePropertyResponse & Partial<PropiedadCompleta>> {
  return client.post<CreatePropertyResponse & Partial<PropiedadCompleta>>(
    "/propiedades/",
    data,
  );
}
