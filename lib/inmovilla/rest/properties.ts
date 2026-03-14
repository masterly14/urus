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
 */
export function normalizePropertyFromRest(raw: PropiedadCompleta): InmovillaProperty {
  const nodisponible = raw.nodisponible === true || raw.nodisponible === 1;
  const estadoDefault = nodisponible ? "No disponible" : "Disponible";
  const estadoRaw = raw.estadoficha ?? raw.lisestado ?? estadoDefault;
  return {
    codigo: raw.cod_ofer != null ? String(raw.cod_ofer) : "",
    ref: String(raw.ref ?? ""),
    titulo: String(raw.tituloes ?? raw.descripciones ?? ""),
    tipoOfer: raw.key_tipo != null ? String(raw.key_tipo) : "",
    precio: Number(raw.precioinmo ?? raw.precio ?? 0),
    metrosConstruidos: Number(raw.m_cons ?? 0),
    habitaciones: Number(raw.habitaciones ?? 0),
    banyos: Number(raw.banyos ?? 0),
    ciudad: String(raw.localidad ?? raw.ciudad ?? ""),
    zona: String(raw.zona ?? (raw.key_zona != null ? raw.key_zona : "")),
    estado: String(estadoRaw),
    fechaAlta: String(raw.fecha ?? ""),
    fechaActualizacion: String(raw.fechaact ?? ""),
    numFotos: Number(raw.numfotos ?? 0),
    agente: String(raw.keyagente ?? raw.usernombre ?? ""),
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
