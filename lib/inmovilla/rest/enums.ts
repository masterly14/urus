/**
 * Lectura de enums/catálogos de la API REST v1 Inmovilla.
 * GET /enums/?calidades | ?tipos | ?paises | ?ciudades | ?zonas
 * Rate limit: 2 peticiones/minuto — la capa de sincronización debe aplicar throttle.
 */

import type { InmovillaRestClient } from "./client";
import type {
  EnumCalidadItem,
  EnumTiposResponse,
  EnumTipoItem,
  EnumPaisItem,
  EnumCiudadesProvinciaItem,
  EnumZonasResponse,
} from "./types";

const ENUMS_PATH = "/enums/";

/**
 * GET /enums/?calidades — listado de campos booleanos (true/false) para propiedades.
 */
export async function getCalidades(
  client: InmovillaRestClient,
): Promise<EnumCalidadItem[]> {
  const data = await client.get<EnumCalidadItem[]>(ENUMS_PATH, { calidades: true });
  return Array.isArray(data) ? data : [];
}

/**
 * GET /enums/?tipos — listado completo de tipos (keyacci, key_tipo, key_loca, key_zona, etc.).
 */
export async function getTipos(client: InmovillaRestClient): Promise<EnumTiposResponse> {
  const data = await client.get<EnumTiposResponse>(ENUMS_PATH, { tipos: true });
  return data && typeof data === "object" ? data : {};
}

/**
 * GET /enums/?tipos={tipo} — un solo tipo por nombre (ej. key_tipo, keyacci).
 */
export async function getTiposByTipo(
  client: InmovillaRestClient,
  tipo: string,
): Promise<EnumTipoItem[]> {
  const data = await client.get<EnumTipoItem[]>(ENUMS_PATH, { tipos: tipo });
  return Array.isArray(data) ? data : [];
}

/**
 * GET /enums/?paises — listado de países (valor se usa en ?ciudades={pais}).
 */
export async function getPaises(client: InmovillaRestClient): Promise<EnumPaisItem[]> {
  const data = await client.get<EnumPaisItem[]>(ENUMS_PATH, { paises: true });
  return Array.isArray(data) ? data : [];
}

/**
 * GET /enums/?ciudades o GET /enums/?ciudades={pais}.
 * Sin parámetro: ciudades de España. Con pais: valor numérico de getPaises()[].valor.
 */
export async function getCiudades(
  client: InmovillaRestClient,
  pais?: string,
): Promise<EnumCiudadesProvinciaItem[]> {
  const params = pais !== undefined ? { ciudades: pais } : { ciudades: true };
  const data = await client.get<EnumCiudadesProvinciaItem[]>(ENUMS_PATH, params);
  return Array.isArray(data) ? data : [];
}

/**
 * GET /enums/?zonas={key_loca} o GET /enums/?zonas=key1,key2,key3.
 * keyLocas: uno o varios key_loca (código de ciudad).
 */
export async function getZonas(
  client: InmovillaRestClient,
  keyLocas: number | number[],
): Promise<EnumZonasResponse> {
  const value =
    typeof keyLocas === "number"
      ? String(keyLocas)
      : keyLocas.map(String).join(",");
  const data = await client.get<EnumZonasResponse>(ENUMS_PATH, { zonas: value });
  return data && typeof data === "object" ? data : {};
}
