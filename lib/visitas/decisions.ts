import {
  AggregateType,
  EventType,
  VisitWorkItemStatus,
  type Prisma,
  type VisitWorkItem,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store";
import { enqueueJob } from "@/lib/job-queue";
import type { JsonValue } from "@/lib/event-store/types";
import { generarCodigoOperacion } from "@/lib/operacion/codigo";
import { updateDemandLeadStatus } from "@/lib/projections/update-lead-status";
import { deactivateDemand } from "@/lib/demands/deactivate";

export type VisitDecision = "green" | "yellow" | "red";

export type DecideVisitInput = {
  visitWorkItemId: string;
  decision: VisitDecision;
  notes?: string;
  reason?: string;
  decidedBy: string;
  causationId?: string | null;
  correlationId?: string | null;
};

type PropertySnapshot = {
  city?: string | null;
  title?: string;
};

export type DecideVisitResult = {
  workItem: VisitWorkItem;
  decisionEventId: string;
  branchEventId?: string;
  operacion?: {
    id: string;
    codigo: string;
    existing: boolean;
  };
  deactivate?: {
    inmovillaSyncQueued: boolean;
    reason?: string;
  };
};

const decisionToStatus: Record<VisitDecision, VisitWorkItemStatus> = {
  green: VisitWorkItemStatus.DECIDED_GREEN,
  yellow: VisitWorkItemStatus.DECIDED_YELLOW,
  red: VisitWorkItemStatus.DECIDED_RED,
};

function propertySnapshot(workItem: VisitWorkItem): PropertySnapshot {
  return (workItem.propertySnapshot ?? {}) as PropertySnapshot;
}

function decisionLabel(decision: VisitDecision): string {
  if (decision === "green") return "Va a comprar";
  if (decision === "yellow") return "Busca algo diferente";
  return "Dar de baja";
}

async function appendAndEnqueue(input: {
  type: EventType;
  aggregateType: AggregateType;
  aggregateId: string;
  payload: JsonValue;
  causationId?: string | null;
  correlationId?: string | null;
}) {
  const event = await appendEvent({
    type: input.type,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    payload: input.payload,
    causationId: input.causationId ?? undefined,
    correlationId: input.correlationId ?? undefined,
  });

  await enqueueJob({
    type: "PROCESS_EVENT",
    payload: { eventId: event.id },
    sourceEventId: event.id,
    idempotencyKey: `process_event:${event.id}`,
  });

  return event;
}

async function createOrReuseOperacion(input: {
  workItem: VisitWorkItem;
  decisionEventId: string;
  decidedBy: string;
}) {
  const existing = await prisma.operacion.findFirst({
    where: {
      propertyCode: input.workItem.propertyId,
      estado: { notIn: ["CERRADA_VENTA", "CERRADA_ALQUILER", "CERRADA_TRASPASO", "CANCELADA"] },
    },
    select: { id: true, codigo: true, demandId: true, estado: true },
  });

  if (existing) {
    if (existing.demandId && existing.demandId !== input.workItem.demandId) {
      throw new Error(
        `Ya existe una operación activa para esta propiedad: ${existing.codigo} (${existing.estado})`,
      );
    }
    return { ...existing, existing: true };
  }

  const codigo = await generarCodigoOperacion();
  const snapshot = propertySnapshot(input.workItem);
  const operacion = await prisma.operacion.create({
    data: {
      codigo,
      propertyCode: input.workItem.propertyId,
      demandId: input.workItem.demandId,
      comercialId: input.workItem.comercialId,
      ciudad: snapshot.city ?? "",
      estado: "EN_CURSO",
    },
    select: { id: true, codigo: true },
  });

  await appendEvent({
    type: EventType.OPERACION_CREADA,
    aggregateType: AggregateType.OPERACION,
    aggregateId: input.workItem.propertyId,
    payload: {
      operacionId: operacion.id,
      operacionCodigo: operacion.codigo,
      propertyCode: input.workItem.propertyId,
      demandId: input.workItem.demandId,
      comercialId: input.workItem.comercialId,
      visitWorkItemId: input.workItem.id,
      createdBy: input.decidedBy,
      source: "visit_decision_green",
    } as unknown as JsonValue,
    causationId: input.decisionEventId,
  });

  return { ...operacion, existing: false };
}

export async function decideVisitWorkItem(input: DecideVisitInput): Promise<DecideVisitResult> {
  const workItem = await prisma.visitWorkItem.findUnique({
    where: { id: input.visitWorkItemId },
  });
  if (!workItem) {
    throw new Error("Visita pre-creada no encontrada");
  }

  const status = decisionToStatus[input.decision];
  const updated = await prisma.visitWorkItem.update({
    where: { id: workItem.id },
    data: { status },
  });

  const basePayload = {
    visitWorkItemId: updated.id,
    demandId: updated.demandId,
    selectionId: updated.selectionId || null,
    propertyId: updated.propertyId,
    comercialId: updated.comercialId,
    decision: input.decision,
    decisionLabel: decisionLabel(input.decision),
    notes: input.notes ?? "",
    reason: input.reason ?? "",
    decidedBy: input.decidedBy,
  } as const;

  const decisionEvent = await appendAndEnqueue({
    type: EventType.POST_VISITA_DECIDIDA,
    aggregateType: AggregateType.DEMAND,
    aggregateId: updated.demandId,
    payload: basePayload as unknown as JsonValue,
    causationId: input.causationId,
    correlationId: input.correlationId,
  });

  if (input.decision === "green") {
    const operacion = await createOrReuseOperacion({
      workItem: updated,
      decisionEventId: decisionEvent.id,
      decidedBy: input.decidedBy,
    });
    await updateDemandLeadStatus(updated.demandId, "EN_NEGOCIACION");

    return {
      workItem: updated,
      decisionEventId: decisionEvent.id,
      operacion,
    };
  }

  if (input.decision === "yellow") {
    await updateDemandLeadStatus(updated.demandId, "EN_SELECCION");
    const branchEvent = await appendAndEnqueue({
      type: EventType.DEMANDA_REPERFILADO_SOLICITADO,
      aggregateType: AggregateType.DEMAND,
      aggregateId: updated.demandId,
      payload: {
        ...basePayload,
        propertySnapshot: updated.propertySnapshot as Prisma.JsonValue,
        nluSummary: updated.nluSummary,
      } as unknown as JsonValue,
      causationId: decisionEvent.id,
      correlationId: input.correlationId,
    });

    return {
      workItem: updated,
      decisionEventId: decisionEvent.id,
      branchEventId: branchEvent.id,
    };
  }

  const branchEvent = await appendAndEnqueue({
    type: EventType.DEMANDA_BAJA_SOLICITADA,
    aggregateType: AggregateType.DEMAND,
    aggregateId: updated.demandId,
    payload: basePayload as unknown as JsonValue,
    causationId: decisionEvent.id,
    correlationId: input.correlationId,
  });
  const deactivate = await deactivateDemand({
    demandId: updated.demandId,
    updatedBy: input.decidedBy,
    source: "visit_decision_red",
    reason: input.reason ?? input.notes,
    causationId: branchEvent.id,
    correlationId: input.correlationId,
  });

  return {
    workItem: updated,
    decisionEventId: decisionEvent.id,
    branchEventId: branchEvent.id,
    deactivate: {
      inmovillaSyncQueued: deactivate.inmovillaSyncQueued,
      reason: deactivate.reason,
    },
  };
}
