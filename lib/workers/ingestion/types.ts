import type { InmovillaProperty } from "@/lib/inmovilla/api/types";

export const DIFF_FIELDS = [
  "precio",
  "metrosConstruidos",
  "habitaciones",
  "banyos",
  "ciudad",
  "zona",
  "estado",
  "fechaActualizacion",
] as const satisfies readonly (keyof InmovillaProperty)[];

export type DiffField = (typeof DIFF_FIELDS)[number];

export type PropertyCreatedChange = {
  type: "created";
  property: InmovillaProperty;
};

export type PropertyModifiedChange = {
  type: "modified";
  property: InmovillaProperty;
  before: Pick<InmovillaProperty, DiffField>;
  changedFields: DiffField[];
};

export type PropertyStatusChangedChange = {
  type: "status_changed";
  property: InmovillaProperty;
  previousEstado: string;
  newEstado: string;
  otherChangedFields: DiffField[];
};

export type PropertyChange =
  | PropertyCreatedChange
  | PropertyModifiedChange
  | PropertyStatusChangedChange;

export type PropertyDiffResult = {
  created: PropertyCreatedChange[];
  modified: PropertyModifiedChange[];
  statusChanged: PropertyStatusChangedChange[];
  unchanged: number;
};

export type IngestionCycleResult = {
  cycleId: string;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  propertiesRead: number;
  eventsEmitted: number;
  diff: {
    created: number;
    modified: number;
    statusChanged: number;
    unchanged: number;
  };
  error?: string;
};

export type PropertyCreatedEventPayload = {
  snapshot: Omit<InmovillaProperty, "raw">;
  detectedAt: string;
};

export type PropertyModifiedEventPayload = {
  before: Pick<InmovillaProperty, DiffField>;
  after: Pick<InmovillaProperty, DiffField>;
  changedFields: DiffField[];
  detectedAt: string;
};

export type PropertyStatusChangedEventPayload = {
  previousEstado: string;
  newEstado: string;
  otherChangedFields: DiffField[];
  snapshot: Omit<InmovillaProperty, "raw">;
  detectedAt: string;
};

export type IngestionEventMetadata = {
  source: "ingestion:properties";
  cycleId: string;
  fingerprint: string;
  aggregateId: string;
  eventType:
    | "PROPIEDAD_CREADA"
    | "PROPIEDAD_MODIFICADA"
    | "ESTADO_CAMBIADO";
  changedFields: DiffField[];
};

export type EventPublicationSummary = {
  emitted: number;
};

export type PropertySnapshotData = Pick<
  InmovillaProperty,
  | "codigo"
  | "ref"
  | "titulo"
  | "tipoOfer"
  | "precio"
  | "metrosConstruidos"
  | "habitaciones"
  | "banyos"
  | "ciudad"
  | "zona"
  | "estado"
  | "fechaAlta"
  | "fechaActualizacion"
  | "numFotos"
  | "agente"
>;
