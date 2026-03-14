import { prisma } from "@/lib/prisma";
import { dequeueJob, markCompleted, markFailed } from "@/lib/job-queue";
import { applyPropertyProjection } from "./property-projection";
import { applyDemandProjection } from "./demand-projection";
import type {
  ProjectionWorkerConfig,
  ProjectionCycleResult,
  ProjectionLoopResult,
} from "./types";
import { PROJECTION_JOB_TYPES } from "./types";

const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_BATCH_SIZE = 20;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runProjectionCycle(
  config: ProjectionWorkerConfig,
): Promise<ProjectionCycleResult> {
  const { job } = await dequeueJob({
    workerId: config.workerId,
    types: PROJECTION_JOB_TYPES,
  });

  if (!job) {
    return { processed: 0, failed: 0, noWork: true };
  }

  const eventId = job.sourceEventId ?? (job.payload as { eventId?: string })?.eventId;

  if (!eventId) {
    console.error(
      `[projection-worker] Job ${job.id} sin referencia a evento — marcando FAILED`,
    );
    await markFailed({
      jobId: job.id,
      error: "Job de proyección sin referencia a evento",
      workerId: config.workerId,
    });
    return { processed: 0, failed: 1, noWork: false };
  }

  const event = await prisma.event.findUnique({ where: { id: eventId } });

  if (!event) {
    console.error(
      `[projection-worker] Evento ${eventId} no encontrado para job ${job.id} — marcando FAILED`,
    );
    await markFailed({
      jobId: job.id,
      error: `Evento ${eventId} no existe en el Event Store`,
      workerId: config.workerId,
    });
    return { processed: 0, failed: 1, noWork: false };
  }

  try {
    let result;

    if (job.type === "UPDATE_PROPERTY_PROJECTION") {
      result = await applyPropertyProjection(event);
    } else if (job.type === "UPDATE_DEMAND_PROJECTION") {
      result = await applyDemandProjection(event);
    } else {
      console.warn(`[projection-worker] Tipo de job no esperado: ${job.type}`);
      await markCompleted({ jobId: job.id, workerId: config.workerId });
      return { processed: 1, failed: 0, noWork: false };
    }

    if (!result.success) {
      console.error(
        `[projection-worker] Proyección falló para ${job.type}: ${result.error}`,
      );
      await markFailed({
        jobId: job.id,
        error: result.error ?? "Proyección falló",
        workerId: config.workerId,
      });
      return { processed: 0, failed: 1, noWork: false };
    }

    await updateCheckpoint(job.type, event.id, event.position, event.occurredAt);
    await markCompleted({ jobId: job.id, workerId: config.workerId });

    console.log(
      `[projection-worker] Job ${job.id} completado — ${job.type} aggregateId=${event.aggregateId}`,
    );
    return { processed: 1, failed: 0, noWork: false };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[projection-worker] Excepción en ${job.type}: ${message}`);
    await markFailed({
      jobId: job.id,
      error: message,
      workerId: config.workerId,
    });
    return { processed: 0, failed: 1, noWork: false };
  }
}

async function updateCheckpoint(
  jobType: string,
  eventId: string,
  eventPosition: bigint,
  eventAt: Date,
): Promise<void> {
  const projectionName =
    jobType === "UPDATE_PROPERTY_PROJECTION"
      ? "PROPERTIES_CURRENT"
      : "DEMANDS_CURRENT";

  try {
    const current = await prisma.projectionCheckpoint.findUnique({
      where: { projectionName: projectionName as "PROPERTIES_CURRENT" | "DEMANDS_CURRENT" },
    });

    if (current?.lastEventPosition != null && current.lastEventPosition >= eventPosition) {
      return;
    }

    await prisma.projectionCheckpoint.upsert({
      where: { projectionName: projectionName as "PROPERTIES_CURRENT" | "DEMANDS_CURRENT" },
      create: {
        projectionName: projectionName as "PROPERTIES_CURRENT" | "DEMANDS_CURRENT",
        lastEventId: eventId,
        lastEventPosition: eventPosition,
        lastProcessedAt: eventAt,
      },
      update: {
        lastEventId: eventId,
        lastEventPosition: eventPosition,
        lastProcessedAt: eventAt,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[projection-worker] Error actualizando checkpoint: ${msg}`);
  }
}

export async function runProjectionLoop(
  config: ProjectionWorkerConfig,
): Promise<ProjectionLoopResult> {
  const batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE;
  const pollIntervalMs = config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxCycles = config.maxCycles ?? batchSize;

  let totalProcessed = 0;
  let totalFailed = 0;
  let cycles = 0;
  let consecutiveNoWork = 0;

  console.log(
    `[projection-worker] Loop iniciado workerId=${config.workerId} maxCycles=${maxCycles}`,
  );

  while (cycles < maxCycles) {
    const result = await runProjectionCycle(config);
    cycles++;

    totalProcessed += result.processed;
    totalFailed += result.failed;

    if (result.noWork) {
      consecutiveNoWork++;
      if (consecutiveNoWork >= 3) {
        console.log("[projection-worker] 3 ciclos sin trabajo — terminando loop");
        break;
      }
      await delay(pollIntervalMs);
    } else {
      consecutiveNoWork = 0;
    }
  }

  console.log(
    `[projection-worker] Loop terminado — ciclos=${cycles} procesados=${totalProcessed} fallidos=${totalFailed}`,
  );

  return { totalProcessed, totalFailed, cycles };
}
