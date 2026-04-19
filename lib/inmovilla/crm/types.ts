/**
 * Types for the CRM v2 API (crm.inmovilla.com/new/app/api/v2/).
 * Used for creating prospectos and changing status — operations not available in REST v1.
 */

export interface CreateProspectoParams {
  key_loca: number;
  key_zona: number;
  key_tipo: number;
  calle: string;
  numero: number;
  cp: string;
  planta?: string;
  referenciaCatastral?: string;
  latitud?: number;
  altitud?: number;
  keyacci: number;
  precioinmo: number;
  precioalq: number;
  habitaciones: number;
  banyos: number;
  m_cons: number;
  keyagente: string;
  keycli: number;
  numagencia: string;
  keymedio?: number;
  keycountry?: number;
}

export interface CreateProspectoResponse {
  cod_ofer: number;
  mainData: {
    cod_ofer: number;
    ref: string;
    soyprospecto: number;
    estado: string;
    subEstado: string;
  };
  [key: string]: unknown;
}

export interface StatusChangePayload {
  estado: number;
  subEstado: number;
  comentario: string;
}

export interface StatusChangeResponse {
  success?: boolean;
  [key: string]: unknown;
}
