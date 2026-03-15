import type { Demand } from "@/types/domain";
import type { InmovillaDemand } from "@/lib/inmovilla/api/types-demands";

export const DEMAND_DIFF_FIELDS = [
  "estadoId",
  "estadoNombre",
  "presupuestoMin",
  "presupuestoMax",
  "habitacionesMin",
  "tipos",
  "zonas",
  "fechaActualizacion",
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

export type DemandDiffResult = {
  created: DemandCreatedChange[];
  modified: DemandModifiedChange[];
  statusChanged: DemandStatusChangedChange[];
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

export type DemandIngestionEventMetadata = {
  source: "ingestion:demands";
  cycleId: string;
  fingerprint: string;
  aggregateId: string;
  eventType:
    | "DEMANDA_CREADA"
    | "DEMANDA_MODIFICADA"
    | "DEMANDA_ESTADO_CAMBIADO";
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
>;

/** Compatibilidad: InmovillaDemand cumple el contrato de dominio Demand. */
export type { InmovillaDemand };
