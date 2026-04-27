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
  nodisponible: boolean;
  prospecto: boolean;
  fechaAlta: string;
  fechaActualizacion: string;
  numFotos: number;
  agente: string;
  /**
   * URL absoluta de la foto principal (thumbnail), derivada de
   * `numagencia + cod_ofer + fotoletra` del payload REST. `null` si la
   * propiedad no tiene fotos o falta alguno de esos parámetros.
   */
  mainPhotoUrl?: string | null;
  propietarioNombre?: string | null;
  propietarioDni?: string | null;
  propietarioPhone?: string | null;
  propietarioDomicilioFiscal?: string | null;
  propietarioRegisteredAt?: Date | string | null;
  raw: Record<string, unknown>;
};
