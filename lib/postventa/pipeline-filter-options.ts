import type { LeadStatusPipeline } from "@/lib/postventa/pipeline-types";

/**
 * Valores de `DemandCurrent.leadStatus` (Prisma enum LeadStatus).
 * Mantener alineado con `prisma/schema.prisma`.
 */
export const PIPELINE_LEAD_STATUS_VALUES = [
  "NUEVO",
  "CONTACTADO",
  "EN_SELECCION",
  "VISITA_PENDIENTE",
  "VISITA_CONFIRMADA",
  "VISITA_REALIZADA",
  "EN_NEGOCIACION",
  "EN_FIRMA",
  "CERRADO",
  "PERDIDO",
] as const satisfies readonly LeadStatusPipeline[];

/** Demanda sin fila vinculada o sin `leadStatus` en el read-model. */
export const DEMAND_STATUS_NA = "N/A" as const;

/**
 * Valores de `Operacion.estado` (Prisma enum OperacionEstado).
 * Mantener alineado con `prisma/schema.prisma`.
 */
export const PIPELINE_OPERACION_ESTADO_VALUES = [
  "EN_CURSO",
  "RESERVA",
  "ARRAS",
  "PENDIENTE_FIRMA",
  "CERRADA_VENTA",
  "CERRADA_ALQUILER",
  "CERRADA_TRASPASO",
  "CANCELADA",
] as const;

export type OperacionEstadoFilter = (typeof PIPELINE_OPERACION_ESTADO_VALUES)[number];

export const operacionEstadoFilterLabels: Record<OperacionEstadoFilter, string> = {
  EN_CURSO: "En curso",
  RESERVA: "Reserva",
  ARRAS: "Arras",
  PENDIENTE_FIRMA: "Pendiente firma",
  CERRADA_VENTA: "Cerrada (venta)",
  CERRADA_ALQUILER: "Cerrada (alquiler)",
  CERRADA_TRASPASO: "Cerrada (traspaso)",
  CANCELADA: "Cancelada",
};
