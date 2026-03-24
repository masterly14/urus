import type { EventType } from "@/app/generated/prisma/client";
import type { Event } from "@/types/domain";
import type { EnqueueJobInput } from "@/lib/job-queue/types";
import type { EventHandler, HandlerResult } from "./types";
import { handleLeadIngestado } from "./lead-scoring-handler";
import { handlePropertyMatching } from "./matching-handler";
import { handleDemandaActualizada } from "./write-demand-update-handler";
import { handleWhatsAppRecibido } from "./whatsapp-nlu-handler";
import { handleVisitaEvaluada } from "./visita-evaluada-handler";

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
  return async (event: Event): Promise<HandlerResult> => {
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
  return async (event: Event): Promise<HandlerResult> => {
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
  return async (event: Event): Promise<HandlerResult> => {
    console.log(
      `[consumer] ${event.type} aggregateId=${event.aggregateId} → no-op (placeholder)`,
    );
    return { success: true };
  };
}

// --- Property handlers ---
// PROPIEDAD_CREADA dispara cruce de demandas + projection (matching-handler.ts)
registerHandler("PROPIEDAD_CREADA", handlePropertyMatching);
registerHandler("PROPIEDAD_MODIFICADA", propertyHandler("UPDATE_PROPERTY_PROJECTION"));
registerHandler("ESTADO_CAMBIADO", propertyHandler("UPDATE_PROPERTY_PROJECTION"));

// --- Demand handlers ---
registerHandler("DEMANDA_CREADA", demandHandler("UPDATE_DEMAND_PROJECTION"));
registerHandler("DEMANDA_MODIFICADA", demandHandler("UPDATE_DEMAND_PROJECTION"));
registerHandler("DEMANDA_ESTADO_CAMBIADO", demandHandler("UPDATE_DEMAND_PROJECTION"));

// --- Lead scoring + SLA ---
registerHandler("LEAD_INGESTADO", handleLeadIngestado);

// --- Smart Matching (M5) ---
registerHandler("WHATSAPP_RECIBIDO", handleWhatsAppRecibido);
registerHandler("DEMANDA_ACTUALIZADA", handleDemandaActualizada);

// --- Micro-frontends (M4) ---
registerHandler("VISITA_EVALUADA", handleVisitaEvaluada);
registerHandler("VISITA_AGENDADA", placeholderHandler());
registerHandler("SELECCION_COMPRADOR", placeholderHandler());
registerHandler("SELECCION_VALIDADA", placeholderHandler());
registerHandler("SELECCION_RECHAZADA", placeholderHandler());

// --- Smart Closing (M8) ---
registerHandler("DATOS_INCOMPLETOS", placeholderHandler());

// --- Placeholders (futuras implementaciones) ---
registerHandler("LEAD_SCORED", placeholderHandler());
registerHandler("LEAD_CONTACTADO", placeholderHandler());
registerHandler("SLA_INICIADO", placeholderHandler());
registerHandler("MATCH_GENERADO", placeholderHandler());
registerHandler("WHATSAPP_ENVIADO", placeholderHandler());
