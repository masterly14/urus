import type { AggregateType, EventType } from "@/app/generated/prisma/client";
import { AggregateType as AggregateTypeEnum } from "@/app/generated/prisma/client";
import { getEventsByAggregate } from "@/lib/event-store";
import { isAuthorized } from "@/lib/api/cron-auth";
import { NextResponse } from "next/server";

const VALID_AGGREGATE_TYPES = new Set<string>(
  Object.values(AggregateTypeEnum) as string[],
);

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

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

type RouteParams = { params: Promise<{ aggregateType: string; aggregateId: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { aggregateType, aggregateId } = await params;

  if (!VALID_AGGREGATE_TYPES.has(aggregateType)) {
    return NextResponse.json(
      {
        error: "Invalid aggregateType",
        allowed: Array.from(VALID_AGGREGATE_TYPES),
      },
      { status: 400 },
    );
  }

  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const offsetParam = url.searchParams.get("offset");

  let limit = DEFAULT_LIMIT;
  if (limitParam !== null) {
    const n = Number.parseInt(limitParam, 10);
    if (Number.isNaN(n) || n < 1) {
      return NextResponse.json(
        { error: "Invalid limit (must be a positive integer)" },
        { status: 400 },
      );
    }
    limit = Math.min(n, MAX_LIMIT);
  }

  let offset = 0;
  if (offsetParam !== null) {
    const n = Number.parseInt(offsetParam, 10);
    if (Number.isNaN(n) || n < 0) {
      return NextResponse.json(
        { error: "Invalid offset (must be a non-negative integer)" },
        { status: 400 },
      );
    }
    offset = n;
  }

  try {
    const events = await getEventsByAggregate(
      aggregateType as AggregateType,
      aggregateId,
      { limit, offset },
    );
    return NextResponse.json({
      events: events.map(serializeEvent),
    });
  } catch (err) {
    console.error("[GET /api/events/:aggregateType/:aggregateId]", err);
    return NextResponse.json(
      { error: "Failed to fetch events" },
      { status: 500 },
    );
  }
}
