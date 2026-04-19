import type { OperacionEstado } from "@/app/generated/prisma/client";
import type { Event } from "@/types/domain";
import type { EnqueueJobInput } from "@/lib/job-queue/types";
import { appendEvent } from "@/lib/event-store";
import { isClosedOperation } from "@/lib/post-sale/closed-operation";
import { prisma } from "@/lib/prisma";
import { resolveComercialFromAgente } from "@/lib/routing/resolve-comercial";
import { generarCodigoOperacion } from "@/lib/operacion/codigo";
import { mapEstadoFichaToOperacionEstado } from "@/lib/operacion/estado";
import { resolveDemandIdForProperty } from "@/lib/operacion/resolve-demand";
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
  snapshot?: { codigo?: string; agente?: string };
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
 * Estados de Inmovilla que indican cierre definitivo de una operación.
 * Disparan la cadencia de post-venta (M9).
 */
export const OPERACION_CERRADA_KEYWORDS = [
  "vendido",
  "vendida",
  "alquilado",
  "alquilada",
] as const;

export function isOperacionCerrada(newEstado: string): boolean {
  const normalized = newEstado.toLowerCase();
  return OPERACION_CERRADA_KEYWORDS.some((kw) => normalized.includes(kw));
}

async function resolveOrCreateOperacion(
  propertyCode: string,
  estadoFicha: string,
  snapshot?: { codigo?: string; agente?: string },
) {
  const existing = await prisma.operacion.findFirst({
    where: {
      propertyCode,
      estado: {
        notIn: [
          "CERRADA_VENTA",
          "CERRADA_ALQUILER",
          "CERRADA_TRASPASO",
          "CANCELADA",
        ],
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    // H26: actualizar Operacion.estado si el nuevo estado de Inmovilla mapea
    // a un OperacionEstado distinto del actual (p.ej. RESERVA → ARRAS).
    const mapped = mapEstadoFichaToOperacionEstado(estadoFicha);
    const needsEstadoUpdate = mapped !== null && mapped !== existing.estado;
    const needsDemandUpdate = !existing.demandId;

    if (needsEstadoUpdate || needsDemandUpdate) {
      const data: { estado?: OperacionEstado; demandId?: string } = {};
      if (needsEstadoUpdate && mapped) data.estado = mapped;
      if (needsDemandUpdate) {
        const demandId = await resolveDemandIdForProperty(propertyCode);
        if (demandId) data.demandId = demandId;
      }
      if (Object.keys(data).length > 0) {
        const updated = await prisma.operacion.update({
          where: { id: existing.id },
          data,
        });
        return updated;
      }
    }
    return existing;
  }

  const estado = mapEstadoFichaToOperacionEstado(estadoFicha) ?? "EN_CURSO";
  const agente = (snapshot?.agente ?? "").trim();

  let comercialId: string | null = null;
  if (agente) {
    const comercial = await resolveComercialFromAgente(agente, { requireActive: false });
    comercialId = comercial?.id ?? null;
  }

  const codigo = await generarCodigoOperacion();
  const demandId = await resolveDemandIdForProperty(propertyCode);

  return prisma.operacion.create({
    data: {
      codigo,
      propertyCode,
      estado,
      comercialId,
      demandId,
    },
  });
}

/**
 * H26: sincroniza `Operacion.estado` con el nuevo estadoFicha de Inmovilla.
 * Se ejecuta en CUALQUIER ESTADO_CAMBIADO (no solo en smart-closing ni en
 * cierre) siempre que exista una operación abierta para la propiedad y el
 * nuevo estado mapee a un `OperacionEstado` distinto del actual.
 *
 * Es idempotente: si el estado ya coincide, no hace nada.
 */
async function syncOperacionEstadoForProperty(
  propertyCode: string,
  newEstadoFicha: string,
): Promise<void> {
  const mapped = mapEstadoFichaToOperacionEstado(newEstadoFicha);
  if (!mapped) return;

  const open = await prisma.operacion.findFirst({
    where: {
      propertyCode,
      estado: {
        notIn: [
          "CERRADA_VENTA",
          "CERRADA_ALQUILER",
          "CERRADA_TRASPASO",
          "CANCELADA",
        ],
      },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, estado: true },
  });

  if (!open) return;
  if (open.estado === mapped) return;

  await prisma.operacion.update({
    where: { id: open.id },
    data: { estado: mapped },
  });

  console.log(
    `[consumer] Operacion ${open.id} (propertyCode=${propertyCode}) estado sincronizado: ${open.estado} → ${mapped}`,
  );
}

/**
 * Handler de ESTADO_CAMBIADO que:
 *  1. Siempre encola UPDATE_PROPERTY_PROJECTION (preserva comportamiento existente).
 *  2. Si `newEstado` matchea con estados de Reserva/Arras, encola GENERATE_CONTRACT_DRAFT.
 *  3. Si `newEstado` indica cierre (vendido/alquilado), emite OPERACION_CERRADA y encola START_POSTVENTA_CADENCE.
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
    const operacion = await resolveOrCreateOperacion(
      propertyCode,
      payload.newEstado,
      payload.snapshot as { codigo?: string; agente?: string } | undefined,
    );

    console.log(
      `[smart-closing] ESTADO_CAMBIADO → "${payload.previousEstado}" → "${payload.newEstado}" para ${propertyCode} (operacion=${operacion.codigo}) — disparando generación de borrador`,
    );

    followUpJobs.push({
      type: "GENERATE_CONTRACT_DRAFT",
      payload: {
        propertyCode,
        operacionId: operacion.id,
        operacionCodigo: operacion.codigo,
        demandId: operacion.demandId ?? null,
        previousEstado: payload.previousEstado,
        newEstado: payload.newEstado,
        sourceEventId: event.id,
      },
      idempotencyKey: `generate_contract_draft:${propertyCode}:${event.id}`,
      sourceEventId: event.id,
    });
  }

  if (isClosedOperation(payload.newEstado)) {
    const closedEstado = mapEstadoFichaToOperacionEstado(payload.newEstado);
    let operacionId: string | undefined;
    let operacionDemandId: string | null = null;

    const openOp = await prisma.operacion.findFirst({
      where: {
        propertyCode,
        estado: {
          notIn: [
            "CERRADA_VENTA",
            "CERRADA_ALQUILER",
            "CERRADA_TRASPASO",
            "CANCELADA",
          ],
        },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, demandId: true },
    });

    if (openOp && closedEstado) {
      if (!openOp.demandId) {
        const resolved = await resolveDemandIdForProperty(propertyCode);
        if (resolved) {
          await prisma.operacion.update({
            where: { id: openOp.id },
            data: { estado: closedEstado, closedAt: new Date(), demandId: resolved },
          });
          operacionDemandId = resolved;
        } else {
          await prisma.operacion.update({
            where: { id: openOp.id },
            data: { estado: closedEstado, closedAt: new Date() },
          });
        }
      } else {
        await prisma.operacion.update({
          where: { id: openOp.id },
          data: { estado: closedEstado, closedAt: new Date() },
        });
        operacionDemandId = openOp.demandId;
      }
      operacionId = openOp.id;
    }

    const closedEvent = await appendEvent({
      type: "OPERACION_CERRADA",
      aggregateType: "OPERACION",
      aggregateId: propertyCode,
      payload: {
        previousEstado: payload.previousEstado,
        newEstado: payload.newEstado,
        propertyCode,
        operacionId,
        demandId: operacionDemandId,
        closedAt: event.occurredAt?.toISOString?.() ?? new Date().toISOString(),
        sourceEstadoCambiadoEventId: event.id,
      },
      correlationId: event.correlationId ?? undefined,
      causationId: event.id,
    });

    followUpJobs.push(
      {
        type: "PROCESS_EVENT",
        payload: { eventId: closedEvent.id },
        idempotencyKey: `process_operacion_cerrada:${propertyCode}:${event.id}`,
        sourceEventId: closedEvent.id,
      },
      {
        type: "START_POSTVENTA_CADENCE",
        payload: {
          propertyCode,
          operacionId,
          newEstado: payload.newEstado,
          closedAt: new Date().toISOString(),
          sourceEventId: event.id,
        },
        idempotencyKey: `start_postventa:${propertyCode}:${event.id}`,
        sourceEventId: event.id,
      },
    );

    console.log(
      `[post-sale] ESTADO_CAMBIADO → "${payload.previousEstado}" → "${payload.newEstado}" para ${propertyCode}${operacionId ? ` (operacion=${operacionId})` : ""} — OPERACION_CERRADA emitida (${closedEvent.id}) + cadencia post-venta`,
    );
  }

  if (!isSmartClosingTrigger(payload.newEstado) && !isClosedOperation(payload.newEstado)) {
    // H26: para cambios de estado "intermedios" (no trigger de smart-closing
    // ni cierre) también hay que reflejar el cambio en Operacion.estado si
    // hay una operación abierta. P.ej. PENDIENTE_FIRMA → otro intermedio.
    await syncOperacionEstadoForProperty(propertyCode, payload.newEstado);

    console.log(
      `[consumer] ESTADO_CAMBIADO aggregateId=${event.aggregateId} → UPDATE_PROPERTY_PROJECTION`,
    );
  }

  return { success: true, followUpJobs };
}
