import { createHash } from "crypto";
import { appendEvent } from "@/lib/event-store";
import { enqueueJob } from "@/lib/job-queue";
import type { InmovillaProperty } from "@/lib/inmovilla/api/types";
import type { PropertyDiffResult } from "./types";
import type {
  DiffField,
  EventPublicationSummary,
  IngestionEventMetadata,
  PropertyCreatedEventPayload,
  PropertyModifiedEventPayload,
  PropertyStatusChangedEventPayload,
} from "./types";

const EVENT_ORDER = {
  PROPIEDAD_CREADA: 0,
  PROPIEDAD_MODIFICADA: 1,
  ESTADO_CAMBIADO: 2,
} as const;

type PublishCandidate = {
  eventType: keyof typeof EVENT_ORDER;
  aggregateId: string;
  payload:
    | PropertyCreatedEventPayload
    | PropertyModifiedEventPayload
    | PropertyStatusChangedEventPayload;
  changedFields: DiffField[];
};

function normalizeSnapshot(
  property: InmovillaProperty,
): Omit<InmovillaProperty, "raw"> {
  const { raw: _raw, ...snapshot } = property;
  return snapshot;
}

function buildFingerprint(candidate: PublishCandidate): string {
  const stable = JSON.stringify({
    eventType: candidate.eventType,
    aggregateId: candidate.aggregateId,
    changedFields: [...candidate.changedFields].sort(),
    payload: candidate.payload,
  });

  return createHash("sha256").update(stable).digest("hex");
}

function buildCandidates(
  diff: PropertyDiffResult,
  detectedAt: string,
): PublishCandidate[] {
  const created: PublishCandidate[] = diff.created.map((change) => ({
    eventType: "PROPIEDAD_CREADA",
    aggregateId: change.property.codigo,
    payload: {
      snapshot: normalizeSnapshot(change.property),
      detectedAt,
    },
    changedFields: [],
  }));

  const modified: PublishCandidate[] = diff.modified.map((change) => ({
    eventType: "PROPIEDAD_MODIFICADA",
    aggregateId: change.property.codigo,
    payload: {
      before: change.before,
      after: {
        precio: change.property.precio,
        metrosConstruidos: change.property.metrosConstruidos,
        habitaciones: change.property.habitaciones,
        banyos: change.property.banyos,
        ciudad: change.property.ciudad,
        zona: change.property.zona,
        estado: change.property.estado,
        fechaActualizacion: change.property.fechaActualizacion,
      },
      changedFields: change.changedFields,
      detectedAt,
    },
    changedFields: change.changedFields,
  }));

  const statusChanged: PublishCandidate[] = diff.statusChanged.map((change) => ({
    eventType: "ESTADO_CAMBIADO",
    aggregateId: change.property.codigo,
    payload: {
      previousEstado: change.previousEstado,
      newEstado: change.newEstado,
      otherChangedFields: change.otherChangedFields,
      snapshot: normalizeSnapshot(change.property),
      detectedAt,
    },
    changedFields: ["estado", ...change.otherChangedFields],
  }));

  return [...created, ...modified, ...statusChanged].sort((a, b) => {
    if (a.aggregateId === b.aggregateId) {
      return EVENT_ORDER[a.eventType] - EVENT_ORDER[b.eventType];
    }
    return a.aggregateId.localeCompare(b.aggregateId);
  });
}

export async function publishEventsForDiff(
  diff: PropertyDiffResult,
  cycleId: string,
): Promise<EventPublicationSummary> {
  const detectedAt = new Date().toISOString();
  const candidates = buildCandidates(diff, detectedAt);

  for (const candidate of candidates) {
    const fingerprint = buildFingerprint(candidate);
    const metadata: IngestionEventMetadata = {
      source: "ingestion:properties",
      cycleId,
      fingerprint,
      aggregateId: candidate.aggregateId,
      eventType: candidate.eventType,
      changedFields: candidate.changedFields,
    };

    const event = await appendEvent({
      type: candidate.eventType,
      aggregateType: "PROPERTY",
      aggregateId: candidate.aggregateId,
      payload: candidate.payload,
      metadata,
      correlationId: cycleId,
    });

    await enqueueJob({
      type: "PROCESS_EVENT",
      payload: { eventId: event.id, eventType: event.type },
      sourceEventId: event.id,
      idempotencyKey: `process-event:${event.id}`,
    });

    console.log(
      `[ingestion:properties] Evento emitido type=${candidate.eventType} aggregateId=${candidate.aggregateId} fingerprint=${fingerprint.slice(0, 12)}`,
    );
  }

  return { emitted: candidates.length };
}
