import { prisma } from "@/lib/prisma";
import { enqueueJob } from "@/lib/job-queue";
import { DEFAULT_CADENCE } from "@/lib/sla/assign-sla";

export interface CadenceScanResult {
  leadsScanned: number;
  followUpsEnqueued: number;
  leadsAlreadyCovered: number;
}

/**
 * Ventana temporal de búsqueda de leads. Leads más antiguos de este umbral
 * no se reevalúan por el scanner (follow-ups D+1/D+3/D+7 ya deberían haberse
 * resuelto o quedado fuera de ciclo). Ajustar si cambia la cadencia.
 */
export const CADENCE_LOOKBACK_DAYS = 90;

const SCAN_BATCH_SIZE = 200;

/**
 * Red de seguridad: busca leads LEAD_INGESTADO sin LEAD_CONTACTADO
 * que no tengan jobs FOLLOW_UP_LEAD pendientes, y encola los que falten.
 *
 * Ejecutar periódicamente (ej. cada 6–12h) para cubrir edge cases
 * donde el handler original no pudo encolar los follow-ups.
 *
 * Usa paginación con cursor para cubrir todos los leads dentro de la ventana
 * de `CADENCE_LOOKBACK_DAYS`, evitando dejar leads viejos sin cobertura.
 */
export async function scanAndEnqueueMissingFollowUps(): Promise<CadenceScanResult> {
  const lookbackMs = CADENCE_LOOKBACK_DAYS * 86_400_000;
  const since = new Date(Date.now() - lookbackMs);

  let followUpsEnqueued = 0;
  let leadsAlreadyCovered = 0;
  let leadsScanned = 0;
  let lastCursor: string | undefined;

  while (true) {
    const leadEvents: Array<{
      aggregateId: string;
      id: string;
      occurredAt: Date;
      payload: unknown;
    }> = await prisma.event.findMany({
      where: {
        type: "LEAD_INGESTADO",
        occurredAt: { gte: since },
      },
      select: { aggregateId: true, id: true, occurredAt: true, payload: true },
      orderBy: { id: "asc" },
      take: SCAN_BATCH_SIZE,
      ...(lastCursor ? { skip: 1, cursor: { id: lastCursor } } : {}),
    });

    if (leadEvents.length === 0) break;

    leadsScanned += leadEvents.length;
    lastCursor = leadEvents[leadEvents.length - 1].id;

    for (const leadEvent of leadEvents) {
    const contactCount = await prisma.event.count({
      where: {
        aggregateType: "LEAD",
        aggregateId: leadEvent.aggregateId,
        type: "LEAD_CONTACTADO",
      },
    });

    if (contactCount > 0) {
      leadsAlreadyCovered++;
      continue;
    }

    const pendingFollowUps = await prisma.jobQueue.count({
      where: {
        type: "FOLLOW_UP_LEAD",
        status: { in: ["PENDING", "IN_PROGRESS"] },
        idempotencyKey: { startsWith: `follow_up:${leadEvent.aggregateId}:` },
      },
    });

    if (pendingFollowUps > 0) {
      leadsAlreadyCovered++;
      continue;
    }

    const completedFollowUps = await prisma.jobQueue.count({
      where: {
        type: "FOLLOW_UP_LEAD",
        status: "COMPLETED",
        idempotencyKey: { startsWith: `follow_up:${leadEvent.aggregateId}:` },
      },
    });

    if (completedFollowUps >= DEFAULT_CADENCE.length) {
      leadsAlreadyCovered++;
      continue;
    }

    const payload = (leadEvent.payload ?? {}) as Record<string, unknown>;
    const leadCreatedAt = leadEvent.occurredAt;
    const leadAge = Date.now() - leadCreatedAt.getTime();

    for (const step of DEFAULT_CADENCE) {
      // H22: si el offset ya pasó, no encoles el job — el envío tardío pierde
      // semántica (un "recordatorio D+1" no tiene sentido D+10). El handler
      // principal (lead-scoring-handler) ya encola con availableAt correcto
      // al crear el lead; este scanner solo cubre ventanas futuras.
      if (leadAge >= step.delayMs) continue;

      const idempotencyKey = `follow_up:${leadEvent.aggregateId}:${step.label}`;

      const existingJob = await prisma.jobQueue.findUnique({
        where: { idempotencyKey },
        select: { id: true },
      });

      if (existingJob) continue;

      // H22: availableAt ancorado a leadCreatedAt + offset (no a now()).
      const availableAt = new Date(leadCreatedAt.getTime() + step.delayMs);

      await enqueueJob({
        type: "FOLLOW_UP_LEAD",
        payload: {
          leadAggregateId: leadEvent.aggregateId,
          step: step.label,
          score: typeof payload.score === "number" ? payload.score : 0,
          assignedAgentId: typeof payload.assignedAgentId === "string"
            ? payload.assignedAgentId
            : null,
        },
        availableAt,
        idempotencyKey,
        sourceEventId: leadEvent.id,
      });

      followUpsEnqueued++;
    }
  }

    if (leadEvents.length < SCAN_BATCH_SIZE) break;
  }

  return {
    leadsScanned,
    followUpsEnqueued,
    leadsAlreadyCovered,
  };
}
