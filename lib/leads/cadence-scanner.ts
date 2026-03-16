import { prisma } from "@/lib/prisma";
import { enqueueJob } from "@/lib/job-queue";
import { DEFAULT_CADENCE } from "@/lib/sla/assign-sla";

export interface CadenceScanResult {
  leadsScanned: number;
  followUpsEnqueued: number;
  leadsAlreadyCovered: number;
}

/**
 * Red de seguridad: busca leads LEAD_INGESTADO sin LEAD_CONTACTADO
 * que no tengan jobs FOLLOW_UP_LEAD pendientes, y encola los que falten.
 *
 * Ejecutar periódicamente (ej. cada 6–12h) para cubrir edge cases
 * donde el handler original no pudo encolar los follow-ups.
 */
export async function scanAndEnqueueMissingFollowUps(): Promise<CadenceScanResult> {
  const leadEvents = await prisma.event.findMany({
    where: { type: "LEAD_INGESTADO" },
    select: { aggregateId: true, id: true, occurredAt: true, payload: true },
    orderBy: { occurredAt: "desc" },
    take: 200,
  });

  let followUpsEnqueued = 0;
  let leadsAlreadyCovered = 0;

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
    const now = new Date();
    const leadAge = now.getTime() - leadEvent.occurredAt.getTime();

    for (const step of DEFAULT_CADENCE) {
      if (leadAge < step.delayMs) continue;

      const idempotencyKey = `follow_up:${leadEvent.aggregateId}:${step.label}`;

      const existingJob = await prisma.jobQueue.findUnique({
        where: { idempotencyKey },
        select: { id: true },
      });

      if (existingJob) continue;

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
        idempotencyKey,
        sourceEventId: leadEvent.id,
      });

      followUpsEnqueued++;
    }
  }

  return {
    leadsScanned: leadEvents.length,
    followUpsEnqueued,
    leadsAlreadyCovered,
  };
}
