/**
 * API REST v1 de Inmovilla (token estático).
 * Para operaciones legacy (sesión/cookies) usar lib/inmovilla/api/.
 */

export { createInmovillaRestClient } from "./client";
export type { InmovillaRestClient, InmovillaRestClientConfig } from "./client";
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
} from "./types";
