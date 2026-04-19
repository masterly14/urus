export interface AgentProfile {
  id: string;
  nombre: string;
  telefono: string;
  email: string;
  ciudad: string;
  especialidad: string;
  activo: boolean;
  cargaActual: number;
  cargaMaxima: number;
  leadsAsignados: number;
  leadsCerrados: number;
  /** Ratio 0–1 (e.g. 0.15 = 15%). Stored as Float in DB. */
  tasaConversion: number;
}

export interface RoutingInput {
  ciudad: string;
  especialidad?: string;
}

export interface RoutingResult {
  assigned: boolean;
  agent: AgentProfile | null;
  reason: string;
}
