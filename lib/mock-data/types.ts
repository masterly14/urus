// ============================================================
// URUS Capital — Mock Data Types
// ============================================================

export type SemaforoStatus = "verde" | "amarillo" | "rojo";
export type Arquetipo = "top" | "ineficiente" | "dependiente" | "bajo";
export type NivelEstres = "bajo" | "medio" | "alto";
export type EtapaPostVenta = 1 | 2 | 3 | 4 | 5;
export type TipoCliente = "comprador" | "inversor" | "vendedor";
export type EstadoContrato = "borrador" | "revision" | "enviado" | "firmado";
export type EstadoMensaje = "enviado" | "me_encaja" | "no_encaja" | "busco_diferente";
export type EstadoColaborador = "ok" | "retrasado" | "critico";
export type NotificationSource =
  | "post-venta"
  | "colaboradores"
  | "matching"
  | "pricing"
  | "legal"
  | "bi"
  | "rendimiento"
  | "coach";
export type NotificationSeverity = "info" | "warning" | "critical";
export type Role = "ceo" | "comercial";
export type Trend = "up" | "down" | "stable";

// ── Comerciales ──────────────────────────────────────────────

export interface ComercialKPIs {
  contactoEfectivo: number; // %
  conversionVisita: number; // %
  facturacionLead: number; // € por lead
}

export interface Comercial {
  id: string;
  nombre: string;
  avatar: string;
  ciudad: string;
  kpis: ComercialKPIs;
  arquetipo: Arquetipo;
  tendencia: number[]; // últimas 12 semanas
  nivelEstres: NivelEstres;
  sesionesCoach: number;
  ultimaSesionCoach: string; // ISO date
}

// ── Propiedades ──────────────────────────────────────────────

export interface Propiedad {
  id: string;
  direccion: string;
  precio: number;
  metros: number;
  habitaciones: number;
  zona: string;
  tipologia: string;
  estado: string;
  semaforo: SemaforoStatus;
  diasSinLlamadas: number;
  posicionPortal: number;
  gapPrecio: number; // % vs media
  extras: {
    terraza: boolean;
    garaje: boolean;
    ascensor: boolean;
    reformado: boolean;
  };
}

// ── Operaciones Post-Venta ───────────────────────────────────

export interface MensajePostVenta {
  id: string;
  etapa: EtapaPostVenta;
  tipo: "enviado" | "respuesta";
  contenido: string;
  fecha: string;
}

export interface OperacionPostVenta {
  id: string;
  propiedad: string;
  direccion: string;
  precio: number;
  fechaCierre: string;
  comercial: string;
  etapaActual: EtapaPostVenta;
  tipoCliente: TipoCliente;
  mensajes: MensajePostVenta[];
  checklistCompleto: boolean;
  comprador: string;
  vendedor: string;
}

// ── Colaboradores ────────────────────────────────────────────

export interface Colaborador {
  id: string;
  nombre: string;
  tipo: string;
  ciudad: string;
  especialidad: string;
  slaEsperado: number; // días
  slaReal: number;
  operaciones: number;
  score: number; // 0-100
  estado: EstadoColaborador;
  tendenciaMensual: number[]; // últimos 6 meses
}

// ── Contratos ────────────────────────────────────────────────

export interface VersionContrato {
  version: string;
  fecha: string;
  descripcion: string;
}

export interface Contrato {
  id: string;
  operacion: string;
  tipo: "reserva" | "arras";
  versionActual: string;
  estado: EstadoContrato;
  fechaCreacion: string;
  comercial: string;
  variables: Record<string, string | number | boolean>;
  bloquesActivos: string[];
  versiones: VersionContrato[];
}

// ── Matches ──────────────────────────────────────────────────

export interface Match {
  id: string;
  propiedad: {
    id: string;
    direccion: string;
    precio: number;
    metros: number;
    habitaciones: number;
    zona: string;
  };
  comprador: {
    nombre: string;
    presupuestoMax: number;
    zonasInteres: string[];
  };
  porcentajeMatch: number;
  variablesCoincidentes: string[];
  estadoMensaje: EstadoMensaje;
  fechaMatch: string;
}

// ── Financiero ───────────────────────────────────────────────

export interface KPI {
  valor: number;
  variacion: number; // %
  tendencia: Trend;
  historico: number[]; // últimos 12 meses
}

export interface DatosFinancieros {
  facturacion: KPI;
  ebitda: KPI;
  cashFlow: KPI;
  costeOperativo: KPI;
  operacionesActivas: KPI;
}

// ── Notificaciones ───────────────────────────────────────────

export interface AppNotification {
  id: string;
  source: NotificationSource;
  severity: NotificationSeverity;
  title: string;
  description: string;
  timestamp: string;
  read: boolean;
}

// ── Activity Feed ────────────────────────────────────────────

export interface ActivityEvent {
  id: string;
  icon: string; // Lucide icon name
  text: string;
  timestamp: string;
  type: "success" | "info" | "warning" | "danger";
}
