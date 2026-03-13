/**
 * Tipos para la API REST v1 de Inmovilla (procesos.inmovilla.com/api/v1).
 * Cliente token estático; no confundir con lib/inmovilla/api/ (legacy sesión/cookies).
 */

/** Un ítem del listado GET /propiedades/?listado (ordenado por fechaact). */
export type PropiedadListadoItem = {
  cod_ofer: number;
  ref: string;
  nodisponible: boolean;
  prospecto: boolean;
  fechaact: string;
};

/** Alias para compatibilidad con nombres del plan. */
export type InmovillaRestListadoItem = PropiedadListadoItem;

/** Cuerpo JSON de error devuelto por la API (codigo 400xxx, 404xxx, 406xxx, 408, etc.). */
export type InmovillaRestErrorBody = {
  codigo: number;
  mensaje?: string;
};

// --- Propiedades ---

/** Respuesta de GET /propiedades/?cod_ofer= (~180 campos). Campos documentados + índice para el resto. */
export type PropiedadCompleta = {
  cod_ofer?: number;
  ref?: string;
  keyacci?: number;
  banyos?: number;
  keycli?: number;
  fecha?: string;
  keyori?: number;
  nodisponible?: number | boolean;
  precio?: number;
  precioinmo?: number;
  key_loca?: number;
  key_zona?: number;
  key_tipo?: number;
  calle?: string;
  planta?: number;
  numero?: number;
  habitaciones?: number;
  prospecto?: boolean;
  fechaact?: string;
  [key: string]: unknown;
};

/** Payload mínimo para POST /propiedades/ (crear propiedad). keyacci es obligatorio en la API. */
export type CreatePropertyPayload = {
  ref: string;
  keyacci: number;
  key_tipo: number;
  key_loca: number | string;
  nodisponible?: boolean;
  precioinmo: number;
  banyos?: number;
  habitaciones?: number;
  calle?: string;
  numero?: number;
  planta?: number;
  fotos?: Record<string, { url: string; posicion?: number }>;
  [key: string]: unknown;
};

/** Respuesta de POST /propiedades/ al crear. */
export type CreatePropertyResponse = {
  codigo: number;
  mensaje: string;
  cod_ofer?: number;
};

// --- Clientes ---

/** Payload para POST /clientes/ (crear cliente). Alineado con documentación y create-lead-via-api. */
export type CreateClientPayload = {
  nombre: string;
  apellidos: string;
  nif?: string;
  email: string;
  telefono1?: number;
  telefono2?: number;
  telefono3?: number;
  prefijotel1?: number;
  prefijotel2?: number;
  prefijotel3?: number;
  calle?: string;
  numero?: string;
  planta?: number;
  puerta?: string;
  escalera?: string;
  cp?: string;
  localidad?: string;
  provincia?: string;
  pais?: string;
  nacionalidad?: string;
  observacion?: string;
  nonewsletters?: number;
  gesauto?: number;
  rgpdwhats?: number;
  enviosauto?: boolean;
  keymedio?: number;
  keycomercial?: number;
  captadopor?: number;
  conyuge?: string;
  conemail?: string;
  connif?: string;
  fechanacimiento?: string;
  altacliente?: string;
  telefono4?: number;
  telefono5?: number;
  prefijotel4?: number;
  prefijotel5?: number;
};

/** Respuesta de POST /clientes/ al crear. */
export type CreateClientResponse = {
  cod_cli: number;
  codigo: number;
  mensaje: string;
};

/** Agente embebido en respuesta de búsqueda de clientes. */
export type ClienteAgente = {
  id?: string;
  nombre?: string;
  apellidos?: string;
  email?: string;
  email_interno?: string;
  telefono1?: string;
  telefono2?: string;
};

/** Cliente devuelto por GET /clientes/?cod_cli= o GET /clientes/buscar/. */
export type Cliente = {
  cod_cli: number | string;
  nombre?: string;
  apellidos?: string;
  nif?: string;
  email?: string;
  calle?: string;
  numero?: string;
  planta?: string;
  puerta?: string;
  escalera?: string;
  cp?: string;
  localidad?: string;
  provincia?: string;
  pais?: string;
  nacionalidad?: string;
  telefono1?: number | string;
  telefono2?: number | string;
  telefono3?: number | string;
  telefono4?: number | string;
  telefono5?: number | string;
  prefijotel1?: number | string;
  prefijotel2?: number | string;
  prefijotel3?: number | string;
  observacion?: string;
  nonewsletters?: number;
  gesauto?: number;
  rgpdwhats?: number;
  enviosauto?: boolean;
  agente?: ClienteAgente;
  [key: string]: unknown;
};

/** Parámetros para GET /clientes/buscar/. AND si se envían ambos. */
export type SearchClientParams = {
  telefono?: string;
  email?: string;
};

// --- Enums / Catálogos (GET /enums/?...) ---

/**
 * Respuesta de GET /enums/?calidades.
 * Listado de campos booleanos (true/false) para propiedades.
 */
export type EnumCalidadItem = {
  campo: string;
  valores: string;
};

/**
 * Respuesta de GET /enums/?tipos (un tipo).
 * Ej.: keyacci, key_tipo, key_loca, key_zona, keycarpin...
 */
export type EnumTipoItem = {
  nombre: string;
  valor: number;
};

/**
 * Respuesta completa de GET /enums/?tipos.
 * Claves: keyacci, key_tipo, key_loca, key_zona, keycarpin, etc.
 */
export type EnumTiposResponse = Record<string, EnumTipoItem[]>;

/**
 * Respuesta de GET /enums/?paises.
 * valor se usa en GET /enums/?ciudades={pais}.
 */
export type EnumPaisItem = {
  pais: string;
  valor: string;
  iso2: string;
  iso3: string;
};

/**
 * Ciudad dentro de GET /enums/?ciudades (o ?ciudades={pais}).
 */
export type EnumCiudadItem = {
  ciudad: string;
  key_loca: number;
};

/**
 * Respuesta de GET /enums/?ciudades o GET /enums/?ciudades={pais}.
 * Por defecto España; pais opcional numérico (valor de paises).
 */
export type EnumCiudadesProvinciaItem = {
  pais?: number;
  provincia: string;
  cod_prov: number;
  ciudades: EnumCiudadItem[];
};

/**
 * Item de zona en GET /enums/?zonas={key_loca} o ?zonas=key1,key2.
 * La API puede devolver "zona" o "ciudad" según el caso; key_zona y key_loca opcionales.
 */
export type EnumZonaItem = {
  zona?: string;
  ciudad?: string;
  key_zona?: number;
  key_loca?: number;
};

/**
 * Respuesta de GET /enums/?zonas={key_loca} o ?zonas=key1,key2.
 * Clave = key_loca como string; valor = array de zonas.
 */
export type EnumZonasResponse = Record<string, EnumZonaItem[]>;
