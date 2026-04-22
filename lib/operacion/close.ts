import type { OperacionEstado } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store";
import { enqueueJob } from "@/lib/job-queue";
import type { JsonValue } from "@/lib/event-store/types";
import { isTerminal, type ClosedEstado } from "./stages";
import { syncLeadStatusFromOperacion } from "./sync-lead-status";
import { resolveBuyerClientCode } from "./resolve-buyer-client-code";
import { extractDemandWriteArgs } from "./extract-demand-write-args";

const KEYSITU_CERRADO = "26";

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export interface CloseResult {
  ok: boolean;
  error?: string;
}

export interface CloseParams {
  operacionId: string;
  tipoCierre: ClosedEstado;
  demandId?: string;
  buyerClientId?: string;
  comercialId: string;
}

export interface CancelResult {
  ok: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Cierre
// ---------------------------------------------------------------------------

/**
 * Cierra una operación:
 * 1. Valida que no es terminal
 * 2. Asocia comprador si se proporciona
 * 3. Actualiza estado + closedAt
 * 4. Emite OPERACION_CERRADA
 * 5. Sincroniza LeadStatus → CERRADO
 * 6. Encola UPDATE_PROPERTY_STATUS_INMOVILLA (REST: estadoficha + keycli)
 * 7. Encola WRITE_TO_INMOVILLA updateDemandStatus keysitu=26 (si hay demandId)
 * 8. Encola START_POSTVENTA_CADENCE
 */
export async function closeOperacion(
  params: CloseParams,
): Promise<CloseResult> {
  const { operacionId, tipoCierre, demandId, buyerClientId, comercialId } = params;

  const operacion = await prisma.operacion.findUnique({
    where: { id: operacionId },
  });

  if (!operacion) {
    return { ok: false, error: `Operación ${operacionId} no encontrada` };
  }

  if (isTerminal(operacion.estado)) {
    return {
      ok: false,
      error: `Operación ${operacion.codigo} ya está en estado terminal (${operacion.estado})`,
    };
  }

  const previousEstado = operacion.estado;
  const now = new Date();

  const effectiveDemandId = demandId ?? operacion.demandId;
  const effectiveBuyerClientId = buyerClientId ?? operacion.buyerClientId;

  const updateData: Record<string, unknown> = {
    estado: tipoCierre as OperacionEstado,
    closedAt: now,
  };
  if (demandId) updateData.demandId = demandId;
  if (buyerClientId) updateData.buyerClientId = buyerClientId;

  await prisma.operacion.update({
    where: { id: operacionId },
    data: updateData,
  });

  const event = await appendEvent({
    type: "OPERACION_CERRADA",
    aggregateType: "OPERACION",
    aggregateId: operacion.propertyCode,
    payload: {
      operacionId: operacion.id,
      operacionCodigo: operacion.codigo,
      propertyCode: operacion.propertyCode,
      previousEstado,
      newEstado: tipoCierre,
      closedAt: now.toISOString(),
      demandId: effectiveDemandId,
      buyerClientId: effectiveBuyerClientId,
      comercialId,
      source: "manual_close",
    } as unknown as JsonValue,
  });

  await syncLeadStatusFromOperacion(operacion.id, tipoCierre as OperacionEstado);

  const estadofichaMap: Record<string, number> = {
    CERRADA_VENTA: 3,
    CERRADA_ALQUILER: 2,
    CERRADA_TRASPASO: 6,
  };

  const buyerClientCode = await resolveBuyerClientCode(
    effectiveBuyerClientId,
    effectiveDemandId,
  );

  await enqueueJob({
    type: "UPDATE_PROPERTY_STATUS_INMOVILLA",
    payload: {
      propertyCode: operacion.propertyCode,
      estadoficha: estadofichaMap[tipoCierre] ?? 3,
      operacionId: operacion.id,
      ...(buyerClientCode ? { buyerClientCode } : {}),
    },
    idempotencyKey: `update_property_status:${operacion.id}:${event.id}`,
    sourceEventId: event.id,
  });

  if (effectiveDemandId) {
    const demandArgs = await extractDemandWriteArgs(effectiveDemandId);
    if (demandArgs) {
      await enqueueJob({
        type: "WRITE_TO_INMOVILLA",
        payload: {
          operation: "updateDemandStatus",
          args: {
            demandId: demandArgs.demandId,
            demandRef: demandArgs.demandRef,
            clientId: demandArgs.clientId,
            agentId: demandArgs.agentId,
            propertyTypes: demandArgs.propertyTypes,
            keysitu: KEYSITU_CERRADO,
          },
        },
        idempotencyKey: `deactivate_demand_on_close:${operacion.id}:${event.id}`,
        sourceEventId: event.id,
      });
      console.log(
        `[operacion] ${operacion.codigo} — enqueued demand deactivation for ${effectiveDemandId} keysitu=${KEYSITU_CERRADO}`,
      );
    } else {
      console.warn(
        `[operacion] ${operacion.codigo} — demand deactivation skipped: could not extract write args for ${effectiveDemandId}`,
      );
    }
  }

  await enqueueJob({
    type: "START_POSTVENTA_CADENCE",
    payload: {
      operacionId: operacion.id,
      operacionCodigo: operacion.codigo,
      propertyCode: operacion.propertyCode,
      closedAt: now.toISOString(),
      demandId: effectiveDemandId,
      buyerClientId: effectiveBuyerClientId,
      comercialId,
    },
    idempotencyKey: `start_postventa:${operacion.id}:${event.id}`,
    sourceEventId: event.id,
  });

  console.log(
    `[operacion] ${operacion.codigo} cerrada: ${previousEstado} → ${tipoCierre} por comercial=${comercialId}` +
      (buyerClientCode ? ` keycli=${buyerClientCode}` : "") +
      (effectiveDemandId ? ` demandId=${effectiveDemandId}` : " (sin comprador)"),
  );

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Cancelación
// ---------------------------------------------------------------------------

/**
 * Cancela una operación. No sincroniza LeadStatus automáticamente
 * (el comercial decide qué hacer con la demanda).
 */
export async function cancelOperacion(
  operacionId: string,
  comercialId: string,
): Promise<CancelResult> {
  const operacion = await prisma.operacion.findUnique({
    where: { id: operacionId },
  });

  if (!operacion) {
    return { ok: false, error: `Operación ${operacionId} no encontrada` };
  }

  if (isTerminal(operacion.estado)) {
    return {
      ok: false,
      error: `Operación ${operacion.codigo} ya está en estado terminal (${operacion.estado})`,
    };
  }

  const previousEstado = operacion.estado;

  await prisma.operacion.update({
    where: { id: operacionId },
    data: { estado: "CANCELADA" },
  });

  await appendEvent({
    type: "OPERACION_CERRADA",
    aggregateType: "OPERACION",
    aggregateId: operacion.propertyCode,
    payload: {
      operacionId: operacion.id,
      operacionCodigo: operacion.codigo,
      propertyCode: operacion.propertyCode,
      previousEstado,
      newEstado: "CANCELADA",
      comercialId,
      source: "manual_cancel",
    } as unknown as JsonValue,
  });

  console.log(
    `[operacion] ${operacion.codigo} cancelada: ${previousEstado} → CANCELADA por comercial=${comercialId}`,
  );

  return { ok: true };
}
