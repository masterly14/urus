import type { AggregateType, JobType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { invalidateCacheForEvent } from "@/lib/cache";
import type {
  AppendEventInput,
  EventRecord,
  GetEventsOptions,
  GetEventsSinceOptions,
} from "./types";

export async function appendEvent(
  input: AppendEventInput,
): Promise<EventRecord> {
  const event = await prisma.event.create({
    data: {
      type: input.type,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      payload: (input.payload ?? {}) as Prisma.InputJsonValue,
      ...(input.metadata !== undefined && {
        metadata: input.metadata as Prisma.InputJsonValue,
      }),
      correlationId: input.correlationId,
      causationId: input.causationId,
      version: input.version,
    },
  });

  invalidateCacheForEvent(event.type);

  return event;
}

export interface AppendAndEnqueueOptions {
  event: AppendEventInput;
  jobType?: JobType;
  jobPayloadExtra?: Record<string, unknown>;
  jobPriority?: number;
  jobAvailableAt?: Date;
  jobMaxAttempts?: number;
  idempotencyKeyPrefix?: string;
}

/**
 * Persiste un evento y encola su PROCESS_EVENT job dentro de una única
 * transacción Prisma. Garantiza que nunca quede un evento sin su job
 * correspondiente (ni un job apuntando a un evento inexistente).
 */
export async function appendEventAndEnqueueJob(
  options: AppendAndEnqueueOptions,
): Promise<EventRecord> {
  const { event: input, jobType, jobPayloadExtra, idempotencyKeyPrefix } = options;
  const type = jobType ?? "PROCESS_EVENT";

  const [event] = await prisma.$transaction(async (tx) => {
    const created = await tx.event.create({
      data: {
        type: input.type,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        payload: (input.payload ?? {}) as Prisma.InputJsonValue,
        ...(input.metadata !== undefined && {
          metadata: input.metadata as Prisma.InputJsonValue,
        }),
        correlationId: input.correlationId,
        causationId: input.causationId,
        version: input.version,
      },
    });

    const prefix = idempotencyKeyPrefix ?? "process-event";
    const idempotencyKey = `${prefix}:${created.id}`;

    await tx.jobQueue.create({
      data: {
        type,
        payload: {
          eventId: created.id,
          eventType: created.type,
          ...jobPayloadExtra,
        } as Prisma.InputJsonValue,
        sourceEvent: { connect: { id: created.id } },
        idempotencyKey,
        ...(options.jobPriority !== undefined ? { priority: options.jobPriority } : {}),
        ...(options.jobAvailableAt !== undefined ? { availableAt: options.jobAvailableAt } : {}),
        ...(options.jobMaxAttempts !== undefined ? { maxAttempts: options.jobMaxAttempts } : {}),
      },
    });

    return [created];
  });

  invalidateCacheForEvent(event.type);

  return event;
}

export async function getEventsByAggregate(
  aggregateType: AggregateType,
  aggregateId: string,
  options?: GetEventsOptions,
): Promise<EventRecord[]> {
  const events = await prisma.event.findMany({
    where: { aggregateType, aggregateId },
    orderBy: { position: "asc" },
    take: options?.limit,
    skip: options?.offset,
  });

  return events;
}

export async function getEventsSince(
  position: bigint,
  options?: GetEventsSinceOptions,
): Promise<EventRecord[]> {
  const events = await prisma.event.findMany({
    where: {
      position: { gt: position },
      ...(options?.type ? { type: options.type } : {}),
    },
    orderBy: { position: "asc" },
    take: options?.limit,
    skip: options?.offset,
  });

  return events;
}
