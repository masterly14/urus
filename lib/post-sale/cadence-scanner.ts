import { prisma } from "@/lib/prisma";
import { enqueueJob } from "@/lib/job-queue";
import { POST_SALE_CADENCE } from "./cadence";

export interface PostSaleCadenceScanResult {
  operationsScanned: number;
  jobsEnqueued: number;
  operationsAlreadyCovered: number;
}

/**
 * Red de seguridad para cadencias post-venta.
 *
 * Busca eventos OPERACION_CERRADA recientes que no tengan los jobs
 * de cadencia correspondientes y los encola.
 *
 * Diseñado para ejecutarse periódicamente (cada 6–12h) como cron,
 * cubriendo edge cases donde el handler original no pudo encolar.
 */
export async function scanAndEnqueueMissingPostSaleJobs(): Promise<PostSaleCadenceScanResult> {
  const closedEvents = await prisma.event.findMany({
    where: { type: "OPERACION_CERRADA" },
    select: { aggregateId: true, id: true, occurredAt: true, payload: true },
    orderBy: { occurredAt: "desc" },
    take: 200,
  });

  let jobsEnqueued = 0;
  let operationsAlreadyCovered = 0;

  for (const closedEvent of closedEvents) {
    const propertyCode = closedEvent.aggregateId;
    const payload = (closedEvent.payload ?? {}) as Record<string, unknown>;
    const closedAt = typeof payload.closedAt === "string"
      ? payload.closedAt
      : closedEvent.occurredAt.toISOString();
    const newEstado = typeof payload.newEstado === "string" ? payload.newEstado : "";
    const closedDate = new Date(closedAt);

    let allCovered = true;

    for (const step of POST_SALE_CADENCE) {
      const idempotencyKey = `post_sale:${propertyCode}:${step.phase}`;

      const existingJob = await prisma.jobQueue.findUnique({
        where: { idempotencyKey },
        select: { id: true },
      });

      if (existingJob) continue;

      allCovered = false;
      const availableAt = new Date(closedDate.getTime() + step.delayMs);

      await enqueueJob({
        type: step.jobType,
        payload: {
          propertyCode,
          newEstado,
          phase: step.phase,
          stepLabel: step.label,
          closedAt,
          sourceEventId: closedEvent.id,
        },
        availableAt,
        idempotencyKey,
        sourceEventId: closedEvent.id,
      });

      jobsEnqueued++;
    }

    if (allCovered) {
      operationsAlreadyCovered++;
    }
  }

  return {
    operationsScanned: closedEvents.length,
    jobsEnqueued,
    operationsAlreadyCovered,
  };
}
