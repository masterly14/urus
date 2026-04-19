import { createHash } from "crypto";
import { appendEventAndEnqueueJob } from "@/lib/event-store";
import type { Demand } from "@/types/domain";
import type { DemandDiffResult } from "./types";
import type {
  DemandDiffField,
  DemandCreatedEventPayload,
  DemandModifiedEventPayload,
  DemandStatusChangedEventPayload,
  DemandRemovedEventPayload,
  DemandIngestionEventMetadata,
  DemandEventPublicationSummary,
} from "./types";

const EVENT_ORDER = {
  DEMANDA_CREADA: 0,
  DEMANDA_MODIFICADA: 1,
  DEMANDA_ESTADO_CAMBIADO: 2,
  DEMANDA_ELIMINADA: 3,
} as const;

type PublishCandidate = {
  eventType: keyof typeof EVENT_ORDER;
  aggregateId: string;
  payload:
    | DemandCreatedEventPayload
    | DemandModifiedEventPayload
    | DemandStatusChangedEventPayload
    | DemandRemovedEventPayload;
  changedFields: DemandDiffField[];
};

function normalizeSnapshot(demand: Demand): Omit<Demand, "raw"> {
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
        nombre: change.demand.nombre,
        ref: change.demand.ref,
        telefono: change.demand.telefono,
        estadoId: change.demand.estadoId,
        estadoNombre: change.demand.estadoNombre,
        presupuestoMin: change.demand.presupuestoMin,
        presupuestoMax: change.demand.presupuestoMax,
        habitacionesMin: change.demand.habitacionesMin,
        tipos: change.demand.tipos,
        zonas: change.demand.zonas,
        fechaActualizacion: change.demand.fechaActualizacion,
        agente: change.demand.agente,
        refConsultada: change.demand.refConsultada,
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

  const removed: PublishCandidate[] = (diff.removed ?? []).map((change) => ({
    eventType: "DEMANDA_ELIMINADA",
    aggregateId: change.codigo,
    payload: {
      previousEstadoId: change.previousEstadoId,
      previousEstadoNombre: change.previousEstadoNombre,
      detectedAt,
    },
    changedFields: [],
  }));

  return [...created, ...modified, ...statusChanged, ...removed].sort((a, b) => {
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

    await appendEventAndEnqueueJob({
      event: {
        type: candidate.eventType,
        aggregateType: "DEMAND",
        aggregateId: candidate.aggregateId,
        payload: candidate.payload,
        metadata,
        correlationId: cycleId,
      },
    });

    console.log(
      `[ingestion:demands] Evento emitido type=${candidate.eventType} aggregateId=${candidate.aggregateId} fingerprint=${fingerprint.slice(0, 12)}`,
    );
  }

  return { emitted: candidates.length };
}
