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
 * Actualiza campos de un cliente existente.
 * PUT /clientes/ con cod_cli + solo los campos a modificar.
 */
export async function updateClient(
  client: InmovillaRestClient,
  cod_cli: number,
  patch: Partial<Pick<CreateClientPayload, "nombre" | "apellidos" | "telefono1" | "telefono2" | "email">>,
): Promise<Cliente> {
  return client.put<Cliente>("/clientes/", { cod_cli, ...patch });
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
  try {
    const result = await client.get<Cliente[] | Cliente>("/clientes/buscar/", query);
    return Array.isArray(result) ? result : [result];
  } catch (err) {
    // REST v1 returns 404 when no clients match — treat as empty result
    if (err instanceof Error && err.message.includes("404")) {
      return [];
    }
    throw err;
  }
}
