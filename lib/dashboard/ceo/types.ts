export type SemaforoStatus = "verde" | "amarillo" | "rojo";

export interface KpiValue {
  value: number;
  previousValue: number | null;
  changePercent: number | null;
}

export interface CeoSemaforos {
  facturacion: SemaforoStatus;
  equipo: SemaforoStatus;
  expansion: SemaforoStatus;
  costes: SemaforoStatus;
}

export interface CeoOperacionesResumen {
  activas: number;
  cerradasMes: number;
}

export interface CeoEquipoResumen {
  comercialesActivos: number;
  alertasAbiertas: number;
  cargaMedia: number;
}

export interface HistoricoEntry {
  period: string;
  revenueEur: number;
  targetRevenueEur: number;
  ebitdaEur: number;
  operatingCostEur: number;
  cashAvailableEur: number;
}

export interface CeoOverviewPayload {
  kpis: {
    facturacionMensual: KpiValue;
    facturacionTrimestral: KpiValue;
    ebitda: KpiValue;
    costeOperativo: KpiValue;
    margenPorOperacion: KpiValue;
    cashDisponible: KpiValue;
    capacidadReinversion: KpiValue;
  };
  semaforos: CeoSemaforos;
  operaciones: CeoOperacionesResumen;
  equipo: CeoEquipoResumen;
  historico: HistoricoEntry[];
}

// ---------------------------------------------------------------------------
// Snapshot financiero manual — status y campos editables
// ---------------------------------------------------------------------------

export interface SnapshotPeriodStatus {
  /** Formato "YYYY-MM" */
  period: string;
  hasData: boolean;
  /** Etiqueta legible: "abril de 2026" */
  label: string;
}

export interface SnapshotStatusResult {
  current: SnapshotPeriodStatus;
  previous: SnapshotPeriodStatus;
  /** true si alguno de los dos periodos no tiene datos */
  needsData: boolean;
}

export interface CeoSnapshotFields {
  ebitdaEur: number;
  operatingCostEur: number;
  cashAvailableEur: number;
  fixedCostsEur: number;
  variableCostsEur: number;
  reinvestmentCapacity: number;
}

// ---------------------------------------------------------------------------
// Capa 2 — Rendimiento por Ciudad
// ---------------------------------------------------------------------------

export const CIUDADES_OPERATIVAS = ["Córdoba", "Málaga", "Sevilla"] as const;
export type CiudadOperativa = (typeof CIUDADES_OPERATIVAS)[number];

export interface CeoCityRow {
  ciudad: string;
  comercialesActivos: number;
  cargaMedia: number;
  propiedadesActivas: number;
  operacionesMes: number;
  facturacionMes: number;
  rentabilidadPorComercial: number;
  costeOportunidadLeadsPerdidos: number;
  costeOportunidadCapacidadOciosa: number;
  costeOportunidadTotal: number;
  /** Datos auxiliares para drill-down */
  leadsAsignados: number;
  leadsPerdidos: number;
  ticketMedio: number;
  capacidadOciosa: number;
  revenuePerLead: number;
}

export interface CeoCityPerformancePayload {
  cities: CeoCityRow[];
  range: { from: string; to: string };
  commissionRate: number;
}
