export type InmovillaDemandField = {
  campo: string;
  value: unknown;
};

export type InmovillaDemandRaw = {
  acciones: unknown[];
  fields: InmovillaDemandField[];
};

export type InmovillaDemandPaginationResponse = {
  demandas: {
    demresultados: {
      info: {
        vista: string;
        ficha: string;
        data: string;
        tipopag: string;
        posicion: number;
        paginacion: number | string;
        pagactual: number;
        campos: Record<string, { pos: number }>;
      };
      datos: InmovillaDemandRaw[];
    };
  };
};

export type InmovillaDemand = {
  codigo: string;
  ref: string;
  nombre: string;
  estadoId: string;
  estadoNombre: string;
  presupuestoMin: number;
  presupuestoMax: number;
  habitacionesMin: number;
  tipos: string;
  zonas: string;
  fechaActualizacion: string;
  agente: string;
  /** Iniciales del comercial tal como las devuelve Inmovilla (campo `siglas`, ej. "MA"). */
  siglas?: string;
  /** ID numérico del agente en Inmovilla (campo `keyagente`/`keycomercial`/`userid`). */
  inmovillaAgentId?: number;
  /** Ref URUS del inmueble en campo Consultada (cruce), si viene en el listado. */
  refConsultada?: string;
  /**
   * Teléfono del comprador con prefijo de país (p. ej. "34658336043").
   * Se extrae de `telefono2_raw` (móvil) con fallback a `telefono1_raw` (fijo).
   */
  telefono?: string;
  raw: Record<string, unknown>;
};
