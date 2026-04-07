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
    types: [
      "PROCESS_EVENT",
      "NOTIFY_LEAD_WHATSAPP",
      "FOLLOW_UP_LEAD",
      "GENERATE_MICROSITE",
      "NOTIFY_MICROSITE_PENDING_VALIDATION",
      "SEND_MICROSITE_TO_BUYER",
      "WRITE_TO_INMOVILLA",
      "GENERATE_CONTRACT_DRAFT",
      "NOTIFY_CONTRACT_DATA_INCOMPLETE",
      "SEND_SIGNATURE_REQUEST",
      "RUN_PRICING_ANALYSIS",
      "NOTIFY_PRICING_WHATSAPP",
      "SEND_POST_SALE_MESSAGE",
      "SEND_REVIEW_REQUEST",
      "SEND_REVIEW_REMINDER",
      "SEND_REFERRAL_REQUEST",
      "START_POSTVENTA_CADENCE",
      "SEND_POSTVENTA_MESSAGE",
      "SEND_DEV_EXERCISE_NUDGE",
    ],
  });

  return NextResponse.json(result);
}

export const maxDuration = 60;
