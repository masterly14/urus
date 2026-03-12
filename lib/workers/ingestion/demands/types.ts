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
] as const satisfies readonly (keyof InmovillaDemand)[];

export type DemandDiffField = (typeof DEMAND_DIFF_FIELDS)[number];

export type DemandCreatedChange = {
  type: "created";
  demand: InmovillaDemand;
};

export type DemandModifiedChange = {
  type: "modified";
  demand: InmovillaDemand;
  before: Pick<InmovillaDemand, DemandDiffField>;
  changedFields: DemandDiffField[];
};

export type DemandStatusChangedChange = {
  type: "status_changed";
  demand: InmovillaDemand;
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
  snapshot: Omit<InmovillaDemand, "raw">;
  detectedAt: string;
};

export type DemandModifiedEventPayload = {
  before: Pick<InmovillaDemand, DemandDiffField>;
  after: Pick<InmovillaDemand, DemandDiffField>;
  changedFields: DemandDiffField[];
  detectedAt: string;
};

export type DemandStatusChangedEventPayload = {
  previousEstadoId: string;
  previousEstadoNombre: string;
  newEstadoId: string;
  newEstadoNombre: string;
  otherChangedFields: DemandDiffField[];
  snapshot: Omit<InmovillaDemand, "raw">;
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
  InmovillaDemand,
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
