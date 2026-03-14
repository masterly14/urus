import { createHash } from "crypto";
import { appendEvent } from "@/lib/event-store";
import { enqueueJob } from "@/lib/job-queue";
import type { InmovillaDemand } from "@/lib/inmovilla/api/types-demands";
import type { DemandDiffResult } from "./types";
import type {
  DemandDiffField,
  DemandCreatedEventPayload,
  DemandModifiedEventPayload,
  DemandStatusChangedEventPayload,
  DemandIngestionEventMetadata,
  DemandEventPublicationSummary,
} from "./types";

const EVENT_ORDER = {
  DEMANDA_CREADA: 0,
  DEMANDA_MODIFICADA: 1,
  DEMANDA_ESTADO_CAMBIADO: 2,
} as const;

type PublishCandidate = {
  eventType: keyof typeof EVENT_ORDER;
  aggregateId: string;
  payload:
    | DemandCreatedEventPayload
    | DemandModifiedEventPayload
    | DemandStatusChangedEventPayload;
  changedFields: DemandDiffField[];
};

function normalizeSnapshot(
  demand: InmovillaDemand,
): Omit<InmovillaDemand, "raw"> {
  const { raw: _raw, ...snapshot } = demand;
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
  diff: DemandDiffResult,
  detectedAt: string,
): PublishCandidate[] {
  const created: PublishCandidate[] = diff.created.map((change) => ({
    eventType: "DEMANDA_CREADA",
    aggregateId: change.demand.codigo,
    payload: {
      snapshot: normalizeSnapshot(change.demand),
      detectedAt,
    },
    changedFields: [],
  }));

  const modified: PublishCandidate[] = diff.modified.map((change) => ({
    eventType: "DEMANDA_MODIFICADA",
    aggregateId: change.demand.codigo,
    payload: {
      before: change.before,
      after: {
        estadoId: change.demand.estadoId,
        estadoNombre: change.demand.estadoNombre,
        presupuestoMin: change.demand.presupuestoMin,
        presupuestoMax: change.demand.presupuestoMax,
        habitacionesMin: change.demand.habitacionesMin,
        tipos: change.demand.tipos,
        zonas: change.demand.zonas,
        fechaActualizacion: change.demand.fechaActualizacion,
      },
      changedFields: change.changedFields,
      detectedAt,
    },
    changedFields: change.changedFields,
  }));

  const statusChanged: PublishCandidate[] = diff.statusChanged.map((change) => ({
    eventType: "DEMANDA_ESTADO_CAMBIADO",
    aggregateId: change.demand.codigo,
    payload: {
      previousEstadoId: change.previousEstadoId,
      previousEstadoNombre: change.previousEstadoNombre,
      newEstadoId: change.newEstadoId,
      newEstadoNombre: change.newEstadoNombre,
      otherChangedFields: change.otherChangedFields,
      snapshot: normalizeSnapshot(change.demand),
      detectedAt,
    },
    changedFields: [
      "estadoId",
      "estadoNombre",
      ...change.otherChangedFields,
    ],
  }));

  return [...created, ...modified, ...statusChanged].sort((a, b) => {
    if (a.aggregateId === b.aggregateId) {
      return EVENT_ORDER[a.eventType] - EVENT_ORDER[b.eventType];
    }
    return a.aggregateId.localeCompare(b.aggregateId);
  });
}

export async function publishDemandEventsForDiff(
  diff: DemandDiffResult,
  cycleId: string,
): Promise<DemandEventPublicationSummary> {
  const detectedAt = new Date().toISOString();
  const candidates = buildCandidates(diff, detectedAt);

  for (const candidate of candidates) {
    const fingerprint = buildFingerprint(candidate);
    const metadata: DemandIngestionEventMetadata = {
      source: "ingestion:demands",
      cycleId,
      fingerprint,
      aggregateId: candidate.aggregateId,
      eventType: candidate.eventType,
      changedFields: candidate.changedFields,
    };

    const event = await appendEvent({
      type: candidate.eventType,
      aggregateType: "DEMAND",
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
      `[ingestion:demands] Evento emitido type=${candidate.eventType} aggregateId=${candidate.aggregateId} fingerprint=${fingerprint.slice(0, 12)}`,
    );
  }

  return { emitted: candidates.length };
}
