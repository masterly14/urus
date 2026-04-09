import type { EventType } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { dequeueJob, enqueueJob, markCompleted, markFailed } from "@/lib/job-queue";
import { getDeadLetterStats } from "@/lib/job-queue/dead-letter";
import type { JobRecord } from "@/lib/job-queue/types";
import {
  persistWorkerExecutionMetric,
  runWithWorkerObservability,
} from "@/lib/observability";
import { getHandler } from "./handlers";
import { getJobHandler, type JobHandler } from "./job-handlers";
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

async function persistConsumerMetric(params: {
  workerId: string;
  jobId?: string;
  jobType?: string;
  eventId?: string;
  eventType?: string;
  operation: string;
  startedAt: Date;
  success: boolean;
  errorMessage?: string;
  errorCode?: string;
  throughputCount?: number;
  context?: Record<string, unknown>;
}): Promise<void> {
  const finishedAt = new Date();
  await persistWorkerExecutionMetric({
    source: "worker",
    operation: params.operation,
    name: params.jobType ? "consumer_job" : "consumer_loop",
    success: params.success,
    startedAt: params.startedAt,
    finishedAt,
    durationMs: finishedAt.getTime() - params.startedAt.getTime(),
    throughputCount: params.throughputCount ?? 1,
    workerId: params.workerId,
    workerName: "consumer",
    jobId: params.jobId,
    jobType: params.jobType,
    eventId: params.eventId,
    eventType: params.eventType,
    errorMessage: params.errorMessage,
    errorCode: params.errorCode,
    context: params.context,
  });
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

  return runWithWorkerObservability(
    {
      source: "worker",
      operation: `consumer:${job.type}`,
      workerName: "consumer",
      workerId: config.workerId,
      jobId: job.id,
      jobType: job.type,
    },
    async () => {
      const directHandler = getJobHandler(job.type);
      if (directHandler) {
        return processDirectJob(job, directHandler, config.workerId);
      }

      const eventId = job.sourceEventId ?? (job.payload as { eventId?: string })?.eventId;
      const metricStartedAt = new Date();

      if (!eventId) {
        const error = "Job PROCESS_EVENT sin referencia a evento";
        console.error(
          `[consumer] Job ${job.id} sin sourceEventId ni payload.eventId — marcando FAILED`,
        );
        await markFailed({
          jobId: job.id,
          error,
          workerId: config.workerId,
        });
        await persistConsumerMetric({
          workerId: config.workerId,
          jobId: job.id,
          jobType: job.type,
          operation: `consumer:${job.type}`,
          startedAt: metricStartedAt,
          success: false,
          errorMessage: error,
        });
        return { processed: 0, failed: 1, noWork: false };
      }

      const event = await prisma.event.findUnique({ where: { id: eventId } });

      if (!event) {
        const error = `Evento ${eventId} no existe en el Event Store`;
        console.error(
          `[consumer] Evento ${eventId} no encontrado para job ${job.id} — marcando FAILED`,
        );
        await markFailed({
          jobId: job.id,
          error,
          workerId: config.workerId,
        });
        await persistConsumerMetric({
          workerId: config.workerId,
          jobId: job.id,
          jobType: job.type,
          eventId,
          operation: `consumer:${job.type}`,
          startedAt: metricStartedAt,
          success: false,
          errorMessage: error,
        });
        return { processed: 0, failed: 1, noWork: false };
      }

      return runWithWorkerObservability(
        {
          source: "worker",
          operation: `consumer:${event.type}`,
          workerName: "consumer",
          workerId: config.workerId,
          jobId: job.id,
          jobType: job.type,
          eventId: event.id,
          eventType: event.type,
        },
        async () => {
          const handler = getHandler(event.type as EventType);

          if (!handler) {
            console.warn(
              `[consumer] Sin handler para ${event.type} — marcando COMPLETED (no-op)`,
            );
            await markCompleted({ jobId: job.id, workerId: config.workerId });
            await persistConsumerMetric({
              workerId: config.workerId,
              jobId: job.id,
              jobType: job.type,
              eventId: event.id,
              eventType: event.type,
              operation: `consumer:${event.type}`,
              startedAt: metricStartedAt,
              success: true,
              context: { noOp: true },
            });
            return { processed: 1, failed: 0, noWork: false };
          }

          try {
            const result = await handler(event);

            if (!result.success) {
              const error = result.error ?? "Handler retornó success=false";
              console.error(
                `[consumer] Handler ${event.type} falló: ${result.error ?? "error desconocido"}` +
                  (result.permanent ? " [PERMANENTE — directo a DLQ]" : ` [intento ${job.attempts}/${job.maxAttempts}]`),
              );
              await markFailed({
                jobId: job.id,
                error,
                workerId: config.workerId,
                permanent: result.permanent,
              });
              await persistConsumerMetric({
                workerId: config.workerId,
                jobId: job.id,
                jobType: job.type,
                eventId: event.id,
                eventType: event.type,
                operation: `consumer:${event.type}`,
                startedAt: metricStartedAt,
                success: false,
                errorMessage: error,
                context: { permanent: result.permanent ?? false },
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
            await persistConsumerMetric({
              workerId: config.workerId,
              jobId: job.id,
              jobType: job.type,
              eventId: event.id,
              eventType: event.type,
              operation: `consumer:${event.type}`,
              startedAt: metricStartedAt,
              success: true,
              context: {
                aggregateId: event.aggregateId,
                followUpJobs: result.followUpJobs?.length ?? 0,
              },
            });
            return { processed: 1, failed: 0, noWork: false };
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(
              `[consumer] Excepción en handler ${event.type}: ${message} [intento ${job.attempts}/${job.maxAttempts}]`,
            );
            await markFailed({
              jobId: job.id,
              error: message,
              workerId: config.workerId,
            });
            await persistConsumerMetric({
              workerId: config.workerId,
              jobId: job.id,
              jobType: job.type,
              eventId: event.id,
              eventType: event.type,
              operation: `consumer:${event.type}`,
              startedAt: metricStartedAt,
              success: false,
              errorMessage: message,
              context: {
                attempts: job.attempts,
                maxAttempts: job.maxAttempts,
              },
            });
            return { processed: 0, failed: 1, noWork: false };
          }
        },
      );
    },
  );
}

async function processDirectJob(
  job: JobRecord,
  handler: JobHandler,
  workerId: string,
): Promise<ConsumerCycleResult> {
  return runWithWorkerObservability(
    {
      source: "worker",
      operation: `consumer:${job.type}`,
      workerName: "consumer",
      workerId,
      jobId: job.id,
      jobType: job.type,
    },
    async () => {
      const metricStartedAt = new Date();

      try {
        const result = await handler(job);

        if (!result.success) {
          const error = result.error ?? "Job handler retornó success=false";
          console.error(
            `[consumer] Job handler ${job.type} falló: ${result.error ?? "error desconocido"}` +
              (result.permanent ? " [PERMANENTE — directo a DLQ]" : ` [intento ${job.attempts}/${job.maxAttempts}]`),
          );
          await markFailed({
            jobId: job.id,
            error,
            workerId,
            permanent: result.permanent,
          });
          await persistConsumerMetric({
            workerId,
            jobId: job.id,
            jobType: job.type,
            operation: `consumer:${job.type}`,
            startedAt: metricStartedAt,
            success: false,
            errorMessage: error,
            context: { permanent: result.permanent ?? false },
          });
          return { processed: 0, failed: 1, noWork: false };
        }

        if (result.followUpJobs?.length) {
          for (const followUp of result.followUpJobs) {
            await enqueueJob(followUp);
          }
        }

        await markCompleted({ jobId: job.id, workerId });
        console.log(`[consumer] Job ${job.id} (${job.type}) completado directamente`);
        await persistConsumerMetric({
          workerId,
          jobId: job.id,
          jobType: job.type,
          operation: `consumer:${job.type}`,
          startedAt: metricStartedAt,
          success: true,
          context: { followUpJobs: result.followUpJobs?.length ?? 0 },
        });
        return { processed: 1, failed: 0, noWork: false };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[consumer] Excepción en job handler ${job.type}: ${message} [intento ${job.attempts}/${job.maxAttempts}]`,
        );
        await markFailed({ jobId: job.id, error: message, workerId });
        await persistConsumerMetric({
          workerId,
          jobId: job.id,
          jobType: job.type,
          operation: `consumer:${job.type}`,
          startedAt: metricStartedAt,
          success: false,
          errorMessage: message,
          context: {
            attempts: job.attempts,
            maxAttempts: job.maxAttempts,
          },
        });
        return { processed: 0, failed: 1, noWork: false };
      }
    },
  );
}

export async function runConsumerLoop(
  config: ConsumerConfig,
): Promise<ConsumerLoopResult> {
  return runWithWorkerObservability(
    {
      source: "worker",
      operation: "consumer:loop",
      workerName: "consumer",
      workerId: config.workerId,
    },
    async () => {
      const loopStartedAt = new Date();
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

      if (totalFailed > 0) {
        try {
          const dlqStats = await getDeadLetterStats();
          if (dlqStats.total > 0) {
            console.warn(
              `[consumer] Dead-letter queue: ${dlqStats.total} job(s) — ${JSON.stringify(dlqStats.byType)}`,
            );
          }
        } catch {
          // No bloquear el loop por un fallo leyendo stats DLQ
        }
      }

      console.log(
        `[consumer] Loop terminado — ciclos=${cycles} procesados=${totalProcessed} fallidos=${totalFailed}`,
      );

      await persistConsumerMetric({
        workerId: config.workerId,
        operation: "consumer:loop",
        startedAt: loopStartedAt,
        success: totalFailed === 0,
        throughputCount: totalProcessed,
        context: {
          cycles,
          totalProcessed,
          totalFailed,
        },
      });

      return { totalProcessed, totalFailed, cycles };
    },
  );
}
