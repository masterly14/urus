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
  "nodisponible",
  "prospecto",
  "fechaActualizacion",
  "agente",
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

/** Propiedad que estaba en el snapshot pero ya no está en estado Libre en Inmovilla. */
export type PropertyRemovedChange = {
  type: "removed";
  codigo: string;
  previousEstado: string;
};

export type PropertyChange =
  | PropertyCreatedChange
  | PropertyModifiedChange
  | PropertyStatusChangedChange
  | PropertyRemovedChange;

export type PropertyDiffResult = {
  created: PropertyCreatedChange[];
  modified: PropertyModifiedChange[];
  statusChanged: PropertyStatusChangedChange[];
  removed: PropertyRemovedChange[];
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
    removed: number;
    unchanged: number;
  };
  error?: string;
  errorCode?: string;
  retryable?: boolean;
};

export type PropertyCreatedEventPayload = {
  snapshot: Omit<Property, "raw">;
  detectedAt: string;
};

export type PropertyModifiedEventPayload = {
  before: Pick<Property, DiffField>;
  after: Pick<Property, DiffField>;
  /**
   * URL absoluta de la foto principal en el momento del ciclo. Se propaga
   * aunque `mainPhotoUrl` no sea un DIFF_FIELD, para que la proyección pueda
   * refrescar `properties_current.mainPhotoUrl` cuando `fotoletra` haya
   * cambiado (p.ej. por reordenación de fotos en Inmovilla).
   */
  mainPhotoUrl?: string | null;
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

export type PropertyRemovedEventPayload = {
  previousEstado: string;
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
    | "ESTADO_CAMBIADO"
    | "PROPIEDAD_ELIMINADA";
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
  | "nodisponible"
  | "prospecto"
  | "fechaAlta"
  | "fechaActualizacion"
  | "numFotos"
  | "agente"
> & {
  /** URL absoluta de la foto principal (thumbnail); `null` si la propiedad no tiene fotos. */
  mainPhotoUrl?: string | null;
  /**
   * JSON crudo de Inmovilla. Se preserva entre ciclos para que los
   * procesos de backfill y enriquecimiento (p.ej. sync-enums) puedan
   * leer `key_loca`/`key_zona` sin volver a pegarle a la API.
   */
  raw?: Record<string, unknown>;
};

/** Compatibilidad: InmovillaProperty cumple el contrato de dominio Property. */
export type { InmovillaProperty };
