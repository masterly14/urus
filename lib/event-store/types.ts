import type {
  EventType,
  AggregateType,
  Prisma,
} from "@/app/generated/prisma/client";

export type JsonValue = Prisma.JsonValue;

export interface AppendEventInput {
  type: EventType;
  aggregateType: AggregateType;
  aggregateId: string;
  payload: JsonValue;
  metadata?: JsonValue;
  correlationId?: string;
  causationId?: string;
  version?: number;
}

export interface EventRecord {
  id: string;
  position: bigint;
  type: EventType;
  aggregateType: AggregateType;
  aggregateId: string;
  version: number | null;
  payload: JsonValue;
  metadata: JsonValue | null;
  correlationId: string | null;
  causationId: string | null;
  occurredAt: Date;
  createdAt: Date;
}

export interface GetEventsOptions {
  limit?: number;
  offset?: number;
}

export interface GetEventsSinceOptions extends GetEventsOptions {
  type?: EventType;
}
