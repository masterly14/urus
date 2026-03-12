/**
 * Funciones de alto nivel para propiedades (API REST v1 Inmovilla).
 * Usan el cliente creado con createInmovillaRestClient().
 */

import type { InmovillaRestClient } from "./client";
import type {
  PropiedadCompleta,
  CreatePropertyPayload,
  CreatePropertyResponse,
} from "./types";

/**
 * Obtiene una propiedad por código de oferta.
 * GET /propiedades/?cod_ofer={cod_ofer}
 */
export async function getProperty(
  client: InmovillaRestClient,
  cod_ofer: number,
): Promise<PropiedadCompleta> {
  return client.get<PropiedadCompleta>("/propiedades/", { cod_ofer });
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
