import type { Demand } from "@/types/domain";
import type { InmovillaDemand } from "@/lib/inmovilla/api/types-demands";

export const DEMAND_DIFF_FIELDS = [
  "nombre",
  "ref",
  "estadoId",
  "estadoNombre",
  "presupuestoMin",
  "presupuestoMax",
  "habitacionesMin",
  "tipos",
  "zonas",
  "fechaActualizacion",
  "agente",
  "refConsultada",
  "telefono",
] as const satisfies readonly (keyof Demand)[];

export type DemandDiffField = (typeof DEMAND_DIFF_FIELDS)[number];

export type DemandCreatedChange = {
  type: "created";
  demand: Demand;
};

export type DemandModifiedChange = {
  type: "modified";
  demand: Demand;
  before: Pick<Demand, DemandDiffField>;
  changedFields: DemandDiffField[];
};

export type DemandStatusChangedChange = {
  type: "status_changed";
  demand: Demand;
  previousEstadoId: string;
  previousEstadoNombre: string;
  newEstadoId: string;
  newEstadoNombre: string;
  otherChangedFields: DemandDiffField[];
};

export type DemandRemovedChange = {
  type: "removed";
  codigo: string;
  previousEstadoId: string;
  previousEstadoNombre: string;
};

export type DemandDiffResult = {
  created: DemandCreatedChange[];
  modified: DemandModifiedChange[];
  statusChanged: DemandStatusChangedChange[];
  removed: DemandRemovedChange[];
  unchanged: number;
};

export type DemandIngestionCycleResult = {
  cycleId: string;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  demandsRead: number;
  eventsEmitted: number;
  diff: {
    created: number;
    modified: number;
    statusChanged: number;
    removed: number;
    unchanged: number;
  };
  error?: string;
};

export type DemandCreatedEventPayload = {
  snapshot: Omit<Demand, "raw">;
  detectedAt: string;
};

export type DemandModifiedEventPayload = {
  before: Pick<Demand, DemandDiffField>;
  after: Pick<Demand, DemandDiffField>;
  changedFields: DemandDiffField[];
  detectedAt: string;
};

export type DemandStatusChangedEventPayload = {
  previousEstadoId: string;
  previousEstadoNombre: string;
  newEstadoId: string;
  newEstadoNombre: string;
  otherChangedFields: DemandDiffField[];
  snapshot: Omit<Demand, "raw">;
  detectedAt: string;
};

export type DemandRemovedEventPayload = {
  previousEstadoId: string;
  previousEstadoNombre: string;
  detectedAt: string;
};

export type DemandIngestionEventMetadata = {
  source: "ingestion:demands";
  cycleId: string;
  fingerprint: string;
  aggregateId: string;
  eventType:
    | "DEMANDA_CREADA"
    | "DEMANDA_MODIFICADA"
    | "DEMANDA_ESTADO_CAMBIADO"
    | "DEMANDA_ELIMINADA";
  changedFields: DemandDiffField[];
};

export type DemandEventPublicationSummary = {
  emitted: number;
};

export type DemandSnapshotData = Pick<
  Demand,
  | "codigo"
  | "ref"
  | "nombre"
  | "estadoId"
  | "estadoNombre"
  | "presupuestoMin"
  | "presupuestoMax"
  | "habitacionesMin"
  | "tipos"
  | "zonas"
  | "fechaActualizacion"
  | "agente"
  | "siglas"
  | "inmovillaAgentId"
  | "refConsultada"
  | "telefono"
>;

/** Compatibilidad: InmovillaDemand cumple el contrato de dominio Demand. */
export type { InmovillaDemand };
