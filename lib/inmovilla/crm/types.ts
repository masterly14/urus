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
  // Campos que CRM v2 valida como obligatorios para create
  // (si no se informan, Inmovilla devuelve 400 "no puede estar vacio").
  alqindex?: string | number;
  alqinferior?: string | number;
  alqsuperior?: string | number;
  conservacion?: number;
  keysuelo?: number;
  keycarpin?: number;
  keycarpinext?: number;
  todoext?: number;
  keyagua?: number;
  keycalefa?: number;
  /**
   * Payload base opcional (p.ej. raw de una ficha existente) para
   * reutilizar defaults que el backend CRM valida como obligatorios.
   */
  seedRaw?: Record<string, unknown>;
  /**
   * Título en castellano para la ficha. Si se informa, se parchea vía REST v1
   * tras la creación (el endpoint CRM v2 no persiste este campo de forma fiable
   * y su ausencia rompe la UI del CRM con "Cannot read properties of undefined
   * (reading 'indexOf')").
   */
  tituloes?: string;
  /** Descripción en castellano. Mismo tratamiento que `tituloes`. */
  descripciones?: string;
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
