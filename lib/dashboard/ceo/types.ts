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
