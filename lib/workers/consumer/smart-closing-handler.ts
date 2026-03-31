import type { Event } from "@/types/domain";
import type { EnqueueJobInput } from "@/lib/job-queue/types";
import { appendEvent } from "@/lib/event-store";
import { isClosedOperation } from "@/lib/post-sale/closed-operation";
import type { HandlerResult } from "./types";

/**
 * Estados de Inmovilla que disparan generación automática de borrador de contrato.
 * Comparación case-insensitive con `.includes()` para cubrir variantes
 * ("Reservada", "Reserva Señal", "Arras firmadas", etc.).
 */
export const SMART_CLOSING_TRIGGER_KEYWORDS = [
  "reserva",
  "reservada",
  "señal",
  "senal",
  "arras",
] as const;

interface StatusChangedPayload {
  previousEstado: string;
  newEstado: string;
  snapshot?: { codigo?: string };
}

function isStatusChangedPayload(p: unknown): p is StatusChangedPayload {
  if (!p || typeof p !== "object") return false;
  const obj = p as Record<string, unknown>;
  return typeof obj.previousEstado === "string" && typeof obj.newEstado === "string";
}

export function isSmartClosingTrigger(newEstado: string): boolean {
  const normalized = newEstado.toLowerCase();
  return SMART_CLOSING_TRIGGER_KEYWORDS.some((kw) => normalized.includes(kw));
}

/**
 * Handler de ESTADO_CAMBIADO que:
 *  1. Siempre encola UPDATE_PROPERTY_PROJECTION (preserva comportamiento existente).
 *  2. Si `newEstado` matchea con estados de Reserva/Arras, encola GENERATE_CONTRACT_DRAFT.
 *  3. Si `newEstado` indica cierre (vendido/alquilado), emite OPERACION_CERRADA.
 */
export async function handleEstadoCambiado(event: Event): Promise<HandlerResult> {
  const followUpJobs: EnqueueJobInput[] = [
    {
      type: "UPDATE_PROPERTY_PROJECTION",
      payload: { eventId: event.id },
      idempotencyKey: `update_property_projection:${event.id}`,
      sourceEventId: event.id,
    },
  ];

  const payload = event.payload;

  if (!isStatusChangedPayload(payload)) {
    console.log(
      `[consumer] ESTADO_CAMBIADO aggregateId=${event.aggregateId} → UPDATE_PROPERTY_PROJECTION`,
    );
    return { success: true, followUpJobs };
  }

  const propertyCode = payload.snapshot?.codigo ?? event.aggregateId;

  if (isSmartClosingTrigger(payload.newEstado)) {
    console.log(
      `[smart-closing] ESTADO_CAMBIADO → "${payload.previousEstado}" → "${payload.newEstado}" para ${propertyCode} — disparando generación de borrador`,
    );

    followUpJobs.push({
      type: "GENERATE_CONTRACT_DRAFT",
      payload: {
        propertyCode,
        previousEstado: payload.previousEstado,
        newEstado: payload.newEstado,
        sourceEventId: event.id,
      },
      idempotencyKey: `generate_contract_draft:${propertyCode}:${event.id}`,
      sourceEventId: event.id,
    });
  }

  if (isClosedOperation(payload.newEstado)) {
    const closedEvent = await appendEvent({
      type: "OPERACION_CERRADA",
      aggregateType: "OPERACION",
      aggregateId: propertyCode,
      payload: {
        previousEstado: payload.previousEstado,
        newEstado: payload.newEstado,
        propertyCode,
        closedAt: event.occurredAt?.toISOString?.() ?? new Date().toISOString(),
        sourceEstadoCambiadoEventId: event.id,
      },
      correlationId: event.correlationId ?? undefined,
      causationId: event.id,
    });

    followUpJobs.push({
      type: "PROCESS_EVENT",
      payload: { eventId: closedEvent.id },
      idempotencyKey: `process_operacion_cerrada:${propertyCode}:${event.id}`,
      sourceEventId: closedEvent.id,
    });

    console.log(
      `[post-sale] ESTADO_CAMBIADO → "${payload.previousEstado}" → "${payload.newEstado}" para ${propertyCode} — OPERACION_CERRADA emitida (${closedEvent.id})`,
    );
  }

  if (!isSmartClosingTrigger(payload.newEstado) && !isClosedOperation(payload.newEstado)) {
    console.log(
      `[consumer] ESTADO_CAMBIADO aggregateId=${event.aggregateId} → UPDATE_PROPERTY_PROJECTION`,
    );
  }

  return { success: true, followUpJobs };
}
