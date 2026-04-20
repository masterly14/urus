export type EtapaPostVenta = 1 | 2 | 3 | 4;
export type TipoCliente = "comprador" | "inversor" | "vendedor";
export type LeadStatusPipeline =
  | "NUEVO"
  | "CONTACTADO"
  | "EN_SELECCION"
  | "VISITA_PENDIENTE"
  | "VISITA_CONFIRMADA"
  | "VISITA_REALIZADA"
  | "EN_NEGOCIACION"
  | "EN_FIRMA"
  | "CERRADO"
  | "PERDIDO";

export interface MensajePostVenta {
  id: string;
  etapa: EtapaPostVenta;
  tipo: "enviado" | "respuesta";
  contenido: string;
  fecha: string;
}

export interface DocumentoPostVenta {
  id: string;
  nombre: string;
  url?: string;
  fecha: string;
}

export interface OperacionPostVenta {
  id: string;
  propiedad: string;
  direccion: string;
  precio: number;
  fechaCierre: string;
  comercial: string;
  comercialNombre?: string;
  comercialCiudad?: string;
  operacionEstado?: string;
  demandLeadStatus?: LeadStatusPipeline;
  etapaActual: EtapaPostVenta;
  tipoCliente: TipoCliente;
  mensajes: MensajePostVenta[];
  checklistCompleto: boolean;
  comprador: string;
  vendedor: string;
  documentos?: DocumentoPostVenta[];
}

export interface PipelineComercialFilter {
  id: string;
  nombre: string;
}

export interface PostventaPipelineResponse {
  operaciones: OperacionPostVenta[];
  comerciales: PipelineComercialFilter[];
}
