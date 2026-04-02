import { prisma } from "@/lib/prisma";
import { enqueueJob } from "@/lib/job-queue";
import { POSTVENTA_CADENCE } from "./start-cadence-handler";
import { isOperacionCerrada } from "@/lib/workers/consumer/smart-closing-handler";
import { hasOpenIncidencia } from "./send-message-handler";
import type { OperacionEstado } from "@/app/generated/prisma/client";

const MAX_OPERATIONS_PER_SCAN = 100;

export interface PostventaScanResult {
  operationsScanned: number;
  followUpsEnqueued: number;
  operationsAlreadyCovered: number;
  operationsPaused: number;
}

interface ClosedOperation {
  aggregateId: string;
  operacionId?: string;
  eventId: string;
  occurredAt: Date;
  closedAt: string;
}

/**
 * Red de seguridad: busca eventos ESTADO_CAMBIADO que indiquen cierre definitivo
 * (Vendido/Alquilado) y verifica que todos los steps de la cadencia post-venta
 * estén cubiertos. Re-encola los faltantes.
 *
 * Tambien re-encola steps pendientes tras resolución de incidencias.
 */
export async function scanPostventaCadences(): Promise<PostventaScanResult> {
  const closingEvents = await prisma.event.findMany({
    where: { type: "ESTADO_CAMBIADO" },
    select: {
      id: true,
      aggregateId: true,
      occurredAt: true,
      payload: true,
    },
    orderBy: { occurredAt: "desc" },
    take: MAX_OPERATIONS_PER_SCAN * 3,
  });

  const closedOperations: ClosedOperation[] = [];
  const seen = new Set<string>();

  for (const ev of closingEvents) {
    if (seen.has(ev.aggregateId)) continue;
    const payload = ev.payload as Record<string, unknown> | null;
    const newEstado = typeof payload?.newEstado === "string" ? payload.newEstado : "";
    if (!isOperacionCerrada(newEstado)) continue;

    seen.add(ev.aggregateId);

    const opPayload = ev.payload as Record<string, unknown> | null;
    const payloadOperacionId =
      typeof opPayload?.operacionId === "string" ? opPayload.operacionId : undefined;

    closedOperations.push({
      aggregateId: ev.aggregateId,
      operacionId: payloadOperacionId,
      eventId: ev.id,
      occurredAt: ev.occurredAt,
      closedAt: ev.occurredAt.toISOString(),
    });

    if (closedOperations.length >= MAX_OPERATIONS_PER_SCAN) break;
  }

  let followUpsEnqueued = 0;
  let operationsAlreadyCovered = 0;
  let operationsPaused = 0;

  for (const op of closedOperations) {
    const paused = await hasOpenIncidencia(op.aggregateId, op.occurredAt);
    if (paused) {
      operationsPaused++;
      continue;
    }

    let allCovered = true;

    let resolvedOperacionId = op.operacionId;
    if (!resolvedOperacionId) {
      const CLOSED_STATES: OperacionEstado[] = [
        "CERRADA_VENTA",
        "CERRADA_ALQUILER",
        "CERRADA_TRASPASO",
      ];
      const opRecord = await prisma.operacion.findFirst({
        where: { propertyCode: op.aggregateId, estado: { in: CLOSED_STATES } },
        orderBy: { closedAt: "desc" },
        select: { id: true },
      });
      resolvedOperacionId = opRecord?.id;
    }

    const idKey = resolvedOperacionId ?? op.aggregateId;

    for (const step of POSTVENTA_CADENCE) {
      const idempotencyKey = `postventa:${idKey}:${step.label}`;
      const now = Date.now();
      const availableTime = op.occurredAt.getTime() + step.delayMs;

      if (now < availableTime) continue;

      const existingJob = await prisma.jobQueue.findUnique({
        where: { idempotencyKey },
        select: { id: true, status: true },
      });

      if (existingJob) continue;

      allCovered = false;

      await enqueueJob({
        type: "SEND_POSTVENTA_MESSAGE",
        payload: {
          propertyCode: op.aggregateId,
          operacionId: resolvedOperacionId,
          step: step.label,
          template: step.template,
          closedAt: op.closedAt,
          requiresNoIncidencia: step.requiresNoIncidencia,
        },
        idempotencyKey,
        sourceEventId: op.eventId,
      });

      followUpsEnqueued++;
    }

    if (allCovered) {
      operationsAlreadyCovered++;
    }
  }

  return {
    operationsScanned: closedOperations.length,
    followUpsEnqueued,
    operationsAlreadyCovered,
    operationsPaused,
  };
}
