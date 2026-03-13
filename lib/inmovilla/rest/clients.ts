/**
 * Funciones de alto nivel para clientes (API REST v1 Inmovilla).
 * Usan el cliente creado con createInmovillaRestClient().
 */

import type { InmovillaRestClient } from "./client";
import type {
  Cliente,
  CreateClientPayload,
  CreateClientResponse,
  SearchClientParams,
} from "./types";

/**
 * Obtiene un cliente por código.
 * GET /clientes/?cod_cli={cod_cli}
 */
export async function getClient(
  client: InmovillaRestClient,
  cod_cli: number,
): Promise<Cliente> {
  return client.get<Cliente>("/clientes/", { cod_cli });
}

/**
 * Crea un cliente (sin vinculación a propiedad).
 * POST /clientes/
 */
export async function createClient(
  client: InmovillaRestClient,
  data: CreateClientPayload,
): Promise<CreateClientResponse> {
  return client.post<CreateClientResponse>("/clientes/", data);
}

/**
 * Busca clientes por teléfono y/o email.
 * GET /clientes/buscar/?telefono={telefono}&email={email}
 * Si se pasan ambos, la API aplica AND.
 */
export async function searchClient(
  client: InmovillaRestClient,
  params: SearchClientParams,
): Promise<Cliente[]> {
  const query: Record<string, string> = {};
  if (params.telefono !== undefined && params.telefono !== "") {
    query.telefono = params.telefono;
  }
  if (params.email !== undefined && params.email !== "") {
    query.email = params.email;
  }
  if (Object.keys(query).length === 0) {
    return [];
  }
  const result = await client.get<Cliente[] | Cliente>("/clientes/buscar/", query);
  return Array.isArray(result) ? result : [result];
}
