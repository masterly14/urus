import type { Property } from "@/types/domain";
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
] as const satisfies readonly (keyof Property)[];

export type DiffField = (typeof DIFF_FIELDS)[number];

export type PropertyCreatedChange = {
  type: "created";
  property: Property;
};

export type PropertyModifiedChange = {
  type: "modified";
  property: Property;
  before: Pick<Property, DiffField>;
  changedFields: DiffField[];
};

export type PropertyStatusChangedChange = {
  type: "status_changed";
  property: Property;
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
  snapshot: Omit<Property, "raw">;
  detectedAt: string;
};

export type PropertyModifiedEventPayload = {
  before: Pick<Property, DiffField>;
  after: Pick<Property, DiffField>;
  changedFields: DiffField[];
  detectedAt: string;
};

export type PropertyStatusChangedEventPayload = {
  previousEstado: string;
  newEstado: string;
  otherChangedFields: DiffField[];
  snapshot: Omit<Property, "raw">;
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
  Property,
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

/** Compatibilidad: InmovillaProperty cumple el contrato de dominio Property. */
export type { InmovillaProperty };
