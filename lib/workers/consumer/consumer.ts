import type { EventType } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { dequeueJob, enqueueJob, markCompleted, markFailed } from "@/lib/job-queue";
import { getHandler } from "./handlers";
import type {
  ConsumerConfig,
  ConsumerCycleResult,
  ConsumerLoopResult,
} from "./types";

const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_BATCH_SIZE = 10;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runConsumerCycle(
  config: ConsumerConfig,
): Promise<ConsumerCycleResult> {
  const { job } = await dequeueJob({
    workerId: config.workerId,
    types: config.types ?? ["PROCESS_EVENT"],
  });

  if (!job) {
    return { processed: 0, failed: 0, noWork: true };
  }

  const eventId = job.sourceEventId ?? (job.payload as { eventId?: string })?.eventId;

  if (!eventId) {
    console.error(
      `[consumer] Job ${job.id} sin sourceEventId ni payload.eventId — marcando FAILED`,
    );
    await markFailed({
      jobId: job.id,
      error: "Job PROCESS_EVENT sin referencia a evento",
      workerId: config.workerId,
    });
    return { processed: 0, failed: 1, noWork: false };
  }

  const event = await prisma.event.findUnique({ where: { id: eventId } });

  if (!event) {
    console.error(
      `[consumer] Evento ${eventId} no encontrado para job ${job.id} — marcando FAILED`,
    );
    await markFailed({
      jobId: job.id,
      error: `Evento ${eventId} no existe en el Event Store`,
      workerId: config.workerId,
    });
    return { processed: 0, failed: 1, noWork: false };
  }

  const handler = getHandler(event.type as EventType);

  if (!handler) {
    console.warn(
      `[consumer] Sin handler para ${event.type} — marcando COMPLETED (no-op)`,
    );
    await markCompleted({ jobId: job.id, workerId: config.workerId });
    return { processed: 1, failed: 0, noWork: false };
  }

  try {
    const result = await handler(event);

    if (!result.success) {
      console.error(
        `[consumer] Handler ${event.type} falló: ${result.error ?? "error desconocido"}`,
      );
      await markFailed({
        jobId: job.id,
        error: result.error ?? "Handler retornó success=false",
        workerId: config.workerId,
      });
      return { processed: 0, failed: 1, noWork: false };
    }

    if (result.followUpJobs?.length) {
      for (const followUp of result.followUpJobs) {
        await enqueueJob(followUp);
      }
      console.log(
        `[consumer] ${result.followUpJobs.length} follow-up job(s) encolados para ${event.type}`,
      );
    }

    await markCompleted({ jobId: job.id, workerId: config.workerId });
    console.log(
      `[consumer] Job ${job.id} completado — ${event.type} aggregateId=${event.aggregateId}`,
    );
    return { processed: 1, failed: 0, noWork: false };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[consumer] Excepción en handler ${event.type}: ${message}`,
    );
    await markFailed({
      jobId: job.id,
      error: message,
      workerId: config.workerId,
    });
    return { processed: 0, failed: 1, noWork: false };
  }
}

export async function runConsumerLoop(
  config: ConsumerConfig,
): Promise<ConsumerLoopResult> {
  const batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE;
  const pollIntervalMs = config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxCycles = config.maxCycles ?? batchSize;

  let totalProcessed = 0;
  let totalFailed = 0;
  let cycles = 0;
  let consecutiveNoWork = 0;

  console.log(
    `[consumer] Loop iniciado workerId=${config.workerId} maxCycles=${maxCycles}`,
  );

  while (cycles < maxCycles) {
    const result = await runConsumerCycle(config);
    cycles++;

    totalProcessed += result.processed;
    totalFailed += result.failed;

    if (result.noWork) {
      consecutiveNoWork++;
      if (consecutiveNoWork >= 3) {
        console.log("[consumer] 3 ciclos sin trabajo — terminando loop");
        break;
      }
      await delay(pollIntervalMs);
    } else {
      consecutiveNoWork = 0;
    }
  }

  console.log(
    `[consumer] Loop terminado — ciclos=${cycles} procesados=${totalProcessed} fallidos=${totalFailed}`,
  );

  return { totalProcessed, totalFailed, cycles };
}
