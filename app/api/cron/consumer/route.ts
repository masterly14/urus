import { NextResponse } from "next/server";
import { isQstashAuthorized } from "@/lib/api/cron-auth";
import { runConsumerLoop, ALL_CONSUMER_JOB_TYPES } from "@/lib/workers/consumer";
import { randomUUID } from "crypto";
import { withObservedRoute } from "@/lib/observability";


const DEFAULT_BATCH_SIZE = 30;
const MAX_BATCH_SIZE = 50;

const postHandler = async (request: Request) => {
  if (!(await isQstashAuthorized(request))) {
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
    types: ALL_CONSUMER_JOB_TYPES,
  });

  return NextResponse.json(result);
}

export const POST = withObservedRoute({ method: "POST", route: "/api/cron/consumer" }, postHandler);

// Vercel Hobby: 60s, Pro: 300s. Increase to 300 when on Pro to drain larger backlogs.
export const maxDuration = 300;
