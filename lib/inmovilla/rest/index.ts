/**
 * API REST v1 de Inmovilla (token estático).
 * Para operaciones legacy (sesión/cookies) usar lib/inmovilla/api/.
 */

export { createInmovillaRestClient } from "./client";
export type { InmovillaRestClient, InmovillaRestClientConfig } from "./client";
export { getProperty, createProperty } from "./properties";
export { getClient, createClient, searchClient } from "./clients";
export {
  getCalidades,
  getTipos,
  getTiposByTipo,
  getPaises,
  getCiudades,
  getZonas,
} from "./enums";
export { syncEnums, throttle } from "./sync-enums";
export type { SyncEnumsOptions } from "./sync-enums";
export type {
  PropiedadListadoItem,
  InmovillaRestListadoItem,
  InmovillaRestErrorBody,
  PropiedadCompleta,
  CreatePropertyPayload,
  CreatePropertyResponse,
  CreateClientPayload,
  CreateClientResponse,
  Cliente,
  ClienteAgente,
  SearchClientParams,
  EnumCalidadItem,
  EnumTipoItem,
  EnumTiposResponse,
  EnumPaisItem,
  EnumCiudadItem,
  EnumCiudadesProvinciaItem,
  EnumZonaItem,
  EnumZonasResponse,
} from "./types";
