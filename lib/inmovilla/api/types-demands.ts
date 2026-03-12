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
  raw: Record<string, unknown>;
};
