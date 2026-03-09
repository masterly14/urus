import type { AggregateType, Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
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
