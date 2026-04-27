import type { EventType } from "@prisma/client";
import type { Event } from "@/types/domain";
import type { EnqueueJobInput } from "@/lib/job-queue/types";
import type { EventHandler, HandlerResult } from "./types";
import { handleLeadIngestado } from "./lead-scoring-handler";
import { handleLeadContactado } from "./lead-contacted-handler";
import { handlePropertyMatching } from "./matching-handler";
import { handleDemandaActualizada } from "./write-demand-update-handler";
import { prisma } from "@/lib/prisma";
import { handleWhatsAppRecibido } from "./whatsapp-nlu-handler";
import { handleVisitaEvaluada } from "./visita-evaluada-handler";
import { handleVisitaAgendada } from "./visita-agendada-handler";
import { handleEstadoCambiado } from "./smart-closing-handler";
import { handleFirmaCompletada } from "./firma-completada-handler";
import { handleContratoBorradorGenerado } from "./contrato-borrador-handler";
import { handleFirmaEnviada } from "./firma-enviada-handler";
import { handleSeleccionComprador } from "./seleccion-comprador-handler";
import { handleMatchGenerado } from "./match-generado-handler";
import { handleContratoAprobado } from "./contrato-aprobado-handler";
import { handleContratoVersionado } from "./contrato-versionado-handler";
import { handleFirmaSlaEscalado } from "./firma-sla-escalado-handler";
import { handleFirmaRechazada } from "./firma-rechazada-handler";
import {
  handleVisitaSolicitada,
  handleVisitaSlotsPropuestos,
  handleVisitaSlotSeleccionado,
  handleVisitaPropuestaEnviada,
  handleVisitaCompradorAcepto,
  handleVisitaCompradorRechazo,
  handleVisitaDatosRecopilados,
  handleVisitaEscaladaManual,
  handleVisitaCancelada,
  handleVisitaReprogramada,
} from "./visit-scheduling-event-handlers";
import { handleNotaEncargoFormularioCompletado } from "./nota-encargo-handlers";
import { handleNotaEncargoLinkOnPropertyCreated } from "./nota-encargo-link-handler";

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

    const followUpJobs: EnqueueJobInput[] = [
      buildProjectionJob(event.id, jobType),
    ];

    if (event.type !== "DEMANDA_ELIMINADA") {
      followUpJobs.push({
        type: "EVALUATE_DEMAND_COVERAGE",
        payload: { demandId: event.aggregateId, sourceEventId: event.id },
        idempotencyKey: `evaluate_coverage:demand:${event.id}`,
        sourceEventId: event.id,
      });
    }

    return { success: true, followUpJobs };
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

/**
 * Cuando una propiedad sale de cartera (eliminada), las demandas que tenían
 * match con ella pierden cobertura. Re-evalúa esas demandas para que el
 * sistema busque alternativas en Statefox si la cobertura cae.
 */
async function handlePropertyRemovedWithCoverage(event: Event): Promise<HandlerResult> {
  const propertyId = event.aggregateId;
  console.log(
    `[consumer] PROPIEDAD_ELIMINADA aggregateId=${propertyId} → projection + coverage re-eval`,
  );

  const followUpJobs: EnqueueJobInput[] = [
    buildProjectionJob(event.id, "UPDATE_PROPERTY_PROJECTION"),
  ];

  try {
    const matchEvents = await prisma.event.findMany({
      where: {
        type: "MATCH_GENERADO",
        payload: { path: ["propertyId"], equals: propertyId },
      },
      select: { payload: true },
      take: 50,
    });

    const demandIds = new Set<string>();
    for (const ev of matchEvents) {
      const p = ev.payload as Record<string, unknown> | null;
      if (typeof p?.demandId === "string") demandIds.add(p.demandId);
    }

    for (const demandId of demandIds) {
      followUpJobs.push({
        type: "EVALUATE_DEMAND_COVERAGE",
        payload: { demandId, sourceEventId: event.id },
        idempotencyKey: `evaluate_coverage:prop_removed:${event.id}:${demandId}`,
        sourceEventId: event.id,
      });
    }

    if (demandIds.size > 0) {
      console.log(
        `[consumer] PROPIEDAD_ELIMINADA ${propertyId} → re-evaluando cobertura de ${demandIds.size} demandas afectadas`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[consumer] PROPIEDAD_ELIMINADA ${propertyId} — error buscando demandas afectadas: ${msg}`,
    );
  }

  return { success: true, followUpJobs };
}

// --- Property handlers ---
// PROPIEDAD_CREADA dispara cruce de demandas + projection (matching-handler.ts)
registerHandler("PROPIEDAD_CREADA", async (event) => {
  const linkResult = await handleNotaEncargoLinkOnPropertyCreated(event);
  if (!linkResult.success) return linkResult;
  return handlePropertyMatching(event);
});
registerHandler("PROPIEDAD_MODIFICADA", handlePropertyMatching);
registerHandler("PROPIEDAD_ELIMINADA", handlePropertyRemovedWithCoverage);
registerHandler("ESTADO_CAMBIADO", handleEstadoCambiado);

// --- Demand handlers ---
registerHandler("DEMANDA_CREADA", demandHandler("UPDATE_DEMAND_PROJECTION"));
registerHandler("DEMANDA_MODIFICADA", demandHandler("UPDATE_DEMAND_PROJECTION"));
registerHandler("DEMANDA_ESTADO_CAMBIADO", demandHandler("UPDATE_DEMAND_PROJECTION"));
registerHandler("DEMANDA_ELIMINADA", demandHandler("UPDATE_DEMAND_PROJECTION"));

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
registerHandler(
  "SELECCION_MICROSITE_DESCRIPCIONES_EDITADAS",
  auditOnlyHandler("side effects en API route PATCH /validar-seleccion: properties JSON actualizado"),
);

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
// NOTA (2026-04-17): La cadencia legacy `post-sale` (lib/post-sale/*) queda
// deprecada. La cadencia canónica vive en `lib/postventa/*` y se dispara
// dentro de `handleEstadoCambiado` (smart-closing-handler) encolando
// `START_POSTVENTA_CADENCE`. Por tanto OPERACION_CERRADA ya no tiene efectos
// de lado aquí; se trata como trazabilidad. Ver docs/postventa-plantillas-whatsapp.md.
registerHandler(
  "OPERACION_CERRADA",
  auditOnlyHandler(
    "Cadencia canónica en lib/postventa (START_POSTVENTA_CADENCE). Legacy post-sale deprecado.",
  ),
);

// --- Operaciones v2 (M11) ---
registerHandler(
  "OPERACION_CREADA",
  auditOnlyHandler("trazabilidad: operación creada desde UI de operaciones"),
);
registerHandler(
  "OPERACION_AVANZADA",
  auditOnlyHandler("trazabilidad: avance manual de etapa desde UI de operaciones"),
);
registerHandler(
  "COMPRADOR_ASOCIADO",
  auditOnlyHandler("trazabilidad: comprador asociado a operación desde flujo de cierre"),
);

// --- Visit Scheduling (M4 rediseño) ---
registerHandler("VISITA_SOLICITADA", handleVisitaSolicitada);
registerHandler("VISITA_SLOTS_PROPUESTOS", handleVisitaSlotsPropuestos);
registerHandler("VISITA_SLOT_SELECCIONADO", handleVisitaSlotSeleccionado);
registerHandler("VISITA_PROPUESTA_ENVIADA", handleVisitaPropuestaEnviada);
registerHandler("VISITA_COMPRADOR_ACEPTO", handleVisitaCompradorAcepto);
registerHandler("VISITA_COMPRADOR_RECHAZO", handleVisitaCompradorRechazo);
registerHandler("VISITA_DATOS_RECOPILADOS", handleVisitaDatosRecopilados);
registerHandler("VISITA_ESCALADA_MANUAL", handleVisitaEscaladaManual);
registerHandler("VISITA_CANCELADA", handleVisitaCancelada);
registerHandler("VISITA_REPROGRAMADA", handleVisitaReprogramada);

// --- Nota de Encargo ---
registerHandler("NOTA_ENCARGO_DETECTADA", auditOnlyHandler("side effects en POST /api/captacion/nota-encargo: crea session + encola NOTA_ENCARGO_RECORDATORIO"));
registerHandler("NOTA_ENCARGO_CONFIRMADA", auditOnlyHandler("side effects en webhook: actualiza state + encola NOTA_ENCARGO_ENVIAR_FORMULARIO"));
registerHandler("NOTA_ENCARGO_NO_CONFIRMADA", auditOnlyHandler("trazabilidad: check-confirmacion job ya notificó al comercial"));
registerHandler("NOTA_ENCARGO_FORMULARIO_COMPLETADO", handleNotaEncargoFormularioCompletado);

// --- Pricing: precio aplicado desde recomendación (M7) ---
registerHandler(
  "PRICING_PRECIO_APLICADO",
  auditOnlyHandler("trazabilidad: API route /api/pricing/apply-price ya actualizó Inmovilla; anti-loop en matching-handler"),
);

// --- Audit-only (eventos de trazabilidad o reservados) ---
registerHandler("LEAD_SCORED", auditOnlyHandler("evento legacy no emitido; scoring incrustado en LEAD_INGESTADO"));
registerHandler("LEAD_CONTACTADO", handleLeadContactado);
registerHandler("SLA_INICIADO", auditOnlyHandler("evento reservado para métricas futuras; SLA asignado inline en lead-scoring-handler"));
registerHandler("MATCH_GENERADO", handleMatchGenerado);
registerHandler("WHATSAPP_ENVIADO", auditOnlyHandler("trazabilidad: job SEND_MICROSITE_TO_BUYER ya envió WhatsApp + upsert sesión"));
