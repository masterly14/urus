import type { EventType } from "@/app/generated/prisma/client";
import type { Event } from "@/types/domain";
import type { EnqueueJobInput } from "@/lib/job-queue/types";
import type { EventHandler, HandlerResult } from "./types";
import { handleLeadIngestado } from "./lead-scoring-handler";
import { handleLeadContactado } from "./lead-contacted-handler";
import { handlePropertyMatching } from "./matching-handler";
import { handleDemandaActualizada } from "./write-demand-update-handler";
import { handleWhatsAppRecibido } from "./whatsapp-nlu-handler";
import { handleVisitaEvaluada } from "./visita-evaluada-handler";
import { handleVisitaAgendada } from "./visita-agendada-handler";
import { handleEstadoCambiado } from "./smart-closing-handler";
import { handleOperacionCerrada } from "@/lib/post-sale/post-sale-handler";
import { handleFirmaCompletada } from "./firma-completada-handler";
import { handleContratoBorradorGenerado } from "./contrato-borrador-handler";
import { handleFirmaEnviada } from "./firma-enviada-handler";
import { handleSeleccionComprador } from "./seleccion-comprador-handler";
import { handleMatchGenerado } from "./match-generado-handler";
import { handleContratoAprobado } from "./contrato-aprobado-handler";
import { handleContratoVersionado } from "./contrato-versionado-handler";
import { handleFirmaSlaEscalado } from "./firma-sla-escalado-handler";
import { handleFirmaRechazada } from "./firma-rechazada-handler";

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

const PRICING_RELEVANT_FIELDS = new Set([
  "precio",
  "metrosConstruidos",
  "habitaciones",
  "banyos",
]);

function propertyHandler(
  jobType: "UPDATE_PROPERTY_PROJECTION",
): EventHandler {
  return async (event: Event): Promise<HandlerResult> => {
    console.log(
      `[consumer] ${event.type} aggregateId=${event.aggregateId} → ${jobType}`,
    );

    const followUpJobs: EnqueueJobInput[] = [
      buildProjectionJob(event.id, jobType),
    ];

    const payload = event.payload as Record<string, unknown> | null;
    const changedFields = Array.isArray(payload?.changedFields)
      ? (payload.changedFields as string[])
      : [];
    const hasPricingRelevantChange = changedFields.some((f) =>
      PRICING_RELEVANT_FIELDS.has(f),
    );

    if (hasPricingRelevantChange) {
      followUpJobs.push({
        type: "RUN_PRICING_ANALYSIS",
        payload: { propertyCode: event.aggregateId },
        idempotencyKey: `run-pricing:${event.id}`,
        sourceEventId: event.id,
      });
    }

    return { success: true, followUpJobs };
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

function auditOnlyHandler(reason: string): EventHandler {
  return async (event: Event): Promise<HandlerResult> => {
    console.log(
      `[consumer] ${event.type} aggregateId=${event.aggregateId} — audit-only (${reason})`,
    );
    return { success: true };
  };
}

// --- Property handlers ---
// PROPIEDAD_CREADA dispara cruce de demandas + projection (matching-handler.ts)
registerHandler("PROPIEDAD_CREADA", handlePropertyMatching);
registerHandler("PROPIEDAD_MODIFICADA", propertyHandler("UPDATE_PROPERTY_PROJECTION"));
registerHandler("ESTADO_CAMBIADO", handleEstadoCambiado);

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
registerHandler("VISITA_AGENDADA", handleVisitaAgendada);
registerHandler("SELECCION_COMPRADOR", handleSeleccionComprador);
registerHandler("SELECCION_VALIDADA", auditOnlyHandler("side effects en API route /validar-seleccion: DB update + job SEND_MICROSITE_TO_BUYER"));
registerHandler("SELECCION_RECHAZADA", auditOnlyHandler("side effects en API route /validar-seleccion: DB update a REJECTED"));

// --- Smart Closing (M8) ---
registerHandler("DATOS_INCOMPLETOS", auditOnlyHandler("emisor emit-incomplete.ts ya encola NOTIFY_CONTRACT_DATA_INCOMPLETE"));
registerHandler("CONTRATO_BORRADOR_GENERADO", handleContratoBorradorGenerado);
registerHandler("CONTRATO_VERSIONADO", handleContratoVersionado);
registerHandler("CONTRATO_APROBADO", handleContratoAprobado);

// --- Firma Digital (M8) ---
registerHandler("FIRMA_ENVIADA", handleFirmaEnviada);
registerHandler("FIRMA_COMPLETADA", handleFirmaCompletada);
registerHandler("FIRMA_RECHAZADA", handleFirmaRechazada);
registerHandler("FIRMA_EXPIRADA", handleFirmaSlaEscalado);
registerHandler("FIRMA_RECORDATORIO_ENVIADO", auditOnlyHandler("trazabilidad: reminder-scanner ya envió WhatsApp + actualizó lastReminderDay"));
registerHandler("FIRMA_SLA_ESCALADO", handleFirmaSlaEscalado);

// --- Post-Venta (M9) ---
registerHandler("INCIDENCIA_POSTVENTA_ABIERTA", auditOnlyHandler("API route ya encola NOTIFY_LEAD_WHATSAPP; pausa de cadencia es declarativa via hasOpenIncidencia()"));
registerHandler("INCIDENCIA_POSTVENTA_RESUELTA", auditOnlyHandler("reanudación automática por cron scanner declarativo en cadence-scanner"));

// --- Post-Venta (M9) ---
registerHandler("OPERACION_CERRADA", handleOperacionCerrada);

// --- Audit-only (eventos de trazabilidad o reservados) ---
registerHandler("LEAD_SCORED", auditOnlyHandler("evento legacy no emitido; scoring incrustado en LEAD_INGESTADO"));
registerHandler("LEAD_CONTACTADO", handleLeadContactado);
registerHandler("SLA_INICIADO", auditOnlyHandler("evento reservado para métricas futuras; SLA asignado inline en lead-scoring-handler"));
registerHandler("MATCH_GENERADO", handleMatchGenerado);
registerHandler("WHATSAPP_ENVIADO", auditOnlyHandler("trazabilidad: job SEND_MICROSITE_TO_BUYER ya envió WhatsApp + upsert sesión"));
