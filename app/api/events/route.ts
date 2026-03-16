import type { AggregateType, EventType } from "@/app/generated/prisma/client";
import {
  AggregateType as AggregateTypeEnum,
  EventType as EventTypeEnum,
} from "@/app/generated/prisma/client";
import { appendEvent } from "@/lib/event-store";
import type { JsonValue } from "@/lib/event-store/types";
import { isAuthorized } from "@/lib/api/cron-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

const aggregateTypes = Object.values(AggregateTypeEnum) as [AggregateType, ...AggregateType[]];
const eventTypes = Object.values(EventTypeEnum) as [EventType, ...EventType[]];

const postEventSchema = z.object({
  type: z.enum(eventTypes),
  aggregateType: z.enum(aggregateTypes),
  aggregateId: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  metadata: z.record(z.string(), z.unknown()).optional(),
  correlationId: z.string().optional(),
  causationId: z.string().optional(),
  version: z.number().int().optional(),
});

function serializeEvent(record: {
  id: string;
  position: bigint;
  type: EventType;
  aggregateType: AggregateType;
  aggregateId: string;
  version: number | null;
  payload: unknown;
  metadata: unknown;
  correlationId: string | null;
  causationId: string | null;
  occurredAt: Date;
  createdAt: Date;
}) {
  return {
    ...record,
    position: String(record.position),
    occurredAt: record.occurredAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
  };
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = postEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const event = await appendEvent({
      type: parsed.data.type,
      aggregateType: parsed.data.aggregateType,
      aggregateId: parsed.data.aggregateId,
      payload: parsed.data.payload as JsonValue,
      ...(parsed.data.metadata !== undefined && {
        metadata: parsed.data.metadata as JsonValue,
      }),
      ...(parsed.data.correlationId !== undefined && { correlationId: parsed.data.correlationId }),
      ...(parsed.data.causationId !== undefined && { causationId: parsed.data.causationId }),
      ...(parsed.data.version !== undefined && { version: parsed.data.version }),
    });
    return NextResponse.json(serializeEvent(event), { status: 201 });
  } catch (err) {
    console.error("[POST /api/events]", err);
    return NextResponse.json(
      { error: "Failed to persist event" },
      { status: 500 },
    );
  }
}
