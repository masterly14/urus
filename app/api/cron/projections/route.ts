import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/api/cron-auth";
import { runProjectionLoop } from "@/lib/projections";
import { randomUUID } from "crypto";

const DEFAULT_BATCH_SIZE = 20;
const MAX_BATCH_SIZE = 100;

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

  const result = await runProjectionLoop({
    workerId: `cron-projections-${randomUUID().slice(0, 8)}`,
    maxCycles: batchSize,
    batchSize,
    pollIntervalMs: 200,
  });

  return NextResponse.json(result);
}

export const maxDuration = 60;
