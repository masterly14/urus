export interface LeadIngestPayload {
  tipo: "comprador" | "propietario";
  ciudad: string;

  nombre?: string;
  email?: string;
  telefono?: string;
  source?: string;

  preaprobacionHipotecaria?: boolean;
  presupuestoDefinido?: boolean;
  plazoDias?: number;
  mensajeConDetalles?: boolean;
  referido?: boolean;
  soloMirando?: boolean;

  urgenciaVenta?: boolean;
  precioCercanoMercado?: boolean;
  exclusivaAceptable?: boolean;
  documentacionDisponible?: boolean;
  probarSinAgencia?: boolean;

  especialidad?: string;
  raw?: Record<string, unknown>;
}

export interface EmitLeadResult {
  eventId: string;
  aggregateId: string;
}
