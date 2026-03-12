export type InmovillaPropertyField = {
  campo: string;
  value: unknown;
};

export type InmovillaPropertyRaw = {
  acciones: unknown[];
  fields: InmovillaPropertyField[];
};

export type InmovillaPaginationResponse = {
  cofe: {
    oferesultados: {
      info: {
        vista: string;
        ficha: string;
        data: string;
        tipopag: string;
        posicion: number;
        paginacion: number;
        pagactual: number;
        campos: Record<string, { pos: number }>;
      };
      datos: InmovillaPropertyRaw[];
    };
  };
};

export type InmovillaProperty = {
  codigo: string;
  ref: string;
  titulo: string;
  tipoOfer: string;
  precio: number;
  metrosConstruidos: number;
  habitaciones: number;
  banyos: number;
  ciudad: string;
  zona: string;
  estado: string;
  fechaAlta: string;
  fechaActualizacion: string;
  numFotos: number;
  agente: string;
  raw: Record<string, unknown>;
};
