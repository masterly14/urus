import type { EventType } from "@/app/generated/prisma/client";
import type { EventRecord } from "@/lib/event-store/types";
import type { EnqueueJobInput } from "@/lib/job-queue/types";
import type { EventHandler, HandlerResult } from "./types";

const registry = new Map<EventType, EventHandler>();

export function registerHandler(type: EventType, handler: EventHandler): void {
  registry.set(type, handler);
}

export function getHandler(type: EventType): EventHandler | undefined {
  return registry.get(type);
}

export function getRegisteredTypes(): EventType[] {
  return [...registry.keys()];
}

function buildProjectionJob(
  eventId: string,
  jobType: "UPDATE_PROPERTY_PROJECTION" | "UPDATE_DEMAND_PROJECTION",
): EnqueueJobInput {
  return {
    type: jobType,
    payload: { eventId },
    idempotencyKey: `${jobType.toLowerCase()}:${eventId}`,
    sourceEventId: eventId,
  };
}

function propertyHandler(
  jobType: "UPDATE_PROPERTY_PROJECTION",
): EventHandler {
  return async (event: EventRecord): Promise<HandlerResult> => {
    console.log(
      `[consumer] ${event.type} aggregateId=${event.aggregateId} → ${jobType}`,
    );
    return {
      success: true,
      followUpJobs: [buildProjectionJob(event.id, jobType)],
    };
  };
}

function demandHandler(
  jobType: "UPDATE_DEMAND_PROJECTION",
): EventHandler {
  return async (event: EventRecord): Promise<HandlerResult> => {
    console.log(
      `[consumer] ${event.type} aggregateId=${event.aggregateId} → ${jobType}`,
    );
    return {
      success: true,
      followUpJobs: [buildProjectionJob(event.id, jobType)],
    };
  };
}

function placeholderHandler(): EventHandler {
  return async (event: EventRecord): Promise<HandlerResult> => {
    console.log(
      `[consumer] ${event.type} aggregateId=${event.aggregateId} → no-op (placeholder)`,
    );
    return { success: true };
  };
}

// --- Property handlers ---
registerHandler("PROPIEDAD_CREADA", propertyHandler("UPDATE_PROPERTY_PROJECTION"));
registerHandler("PROPIEDAD_MODIFICADA", propertyHandler("UPDATE_PROPERTY_PROJECTION"));
registerHandler("ESTADO_CAMBIADO", propertyHandler("UPDATE_PROPERTY_PROJECTION"));

// --- Demand handlers ---
registerHandler("DEMANDA_CREADA", demandHandler("UPDATE_DEMAND_PROJECTION"));
registerHandler("DEMANDA_MODIFICADA", demandHandler("UPDATE_DEMAND_PROJECTION"));
registerHandler("DEMANDA_ESTADO_CAMBIADO", demandHandler("UPDATE_DEMAND_PROJECTION"));

// --- Placeholders (futuras implementaciones) ---
registerHandler("LEAD_INGESTADO", placeholderHandler());
registerHandler("SLA_INICIADO", placeholderHandler());
registerHandler("MATCH_GENERADO", placeholderHandler());
registerHandler("DEMANDA_ACTUALIZADA", placeholderHandler());
