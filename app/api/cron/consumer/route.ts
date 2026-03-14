import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/api/cron-auth";
import { runConsumerLoop } from "@/lib/workers/consumer";
import { randomUUID } from "crypto";

const DEFAULT_BATCH_SIZE = 10;
const MAX_BATCH_SIZE = 50;

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let batchSize = DEFAULT_BATCH_SIZE;

  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.batchSize === "number") {
      batchSize = Math.min(Math.max(1, body.batchSize), MAX_BATCH_SIZE);
    }
  } catch {
    // body vacío, usar default
  }

  const result = await runConsumerLoop({
    workerId: `cron-consumer-${randomUUID().slice(0, 8)}`,
    maxCycles: batchSize,
    batchSize,
    pollIntervalMs: 500,
  });

  return NextResponse.json(result);
}

export const maxDuration = 60;
