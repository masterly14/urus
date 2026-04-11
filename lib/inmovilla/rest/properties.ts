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
} from "./types";
import type { InmovillaProperty } from "@/lib/inmovilla/api/types";
import type { EnumLookupMaps } from "./enum-lookup";

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
    titulo: String(raw.tituloes ?? raw.descripciones ?? ""),
    tipoOfer: raw.key_tipo != null ? String(raw.key_tipo) : "",
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
    raw: raw as Record<string, unknown>,
  };
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
