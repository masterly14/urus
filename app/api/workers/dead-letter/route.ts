import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/api/cron-auth";
import type { JobType } from "@/app/generated/prisma/client";
import {
  listDeadLetterJobs,
  getDeadLetterStats,
  replayDeadLetterJob,
  replayAllDeadLetterByType,
} from "@/lib/job-queue";
import { withObservedRoute } from "@/lib/observability";


/**
 * GET /api/workers/dead-letter
 * Lista jobs en la DLQ con stats. Requiere auth.
 *
 * Query params opcionales: type, limit, offset
 */
const getHandler = async (request: Request) => {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const type = url.searchParams.get("type") as JobType | null;
    const limit = Math.min(
      Number(url.searchParams.get("limit")) || 20,
      100,
    );
    const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);

    const [jobs, stats] = await Promise.all([
      listDeadLetterJobs({
        type: type ?? undefined,
        limit,
        offset,
      }),
      getDeadLetterStats(),
    ]);

    return NextResponse.json({ stats, jobs });
  } catch (err) {
    console.error("[GET /api/workers/dead-letter]", err);
    return NextResponse.json(
      { error: "Error consultando dead-letter queue" },
      { status: 500 },
    );
  }
}

export const GET = withObservedRoute({ method: "GET", route: "/api/workers/dead-letter" }, getHandler);

/**
 * POST /api/workers/dead-letter
 * Reencola jobs de la DLQ. Requiere auth.
 *
 * Body:
 *   { "action": "replay", "jobId": "..." }              → reencola un job
 *   { "action": "replay_all", "type": "WRITE_TO_INMOVILLA" } → reencola todos de un tipo
 */
const postHandler = async (request: Request) => {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = body.action as string;

    if (action === "replay" && typeof body.jobId === "string") {
      const job = await replayDeadLetterJob(body.jobId, {
        maxAttempts:
          typeof body.maxAttempts === "number" ? body.maxAttempts : undefined,
      });
      return NextResponse.json({
        action: "replay",
        jobId: job.id,
        status: job.status,
      });
    }

    if (action === "replay_all" && typeof body.type === "string") {
      const count = await replayAllDeadLetterByType(body.type as JobType, {
        maxAttempts:
          typeof body.maxAttempts === "number" ? body.maxAttempts : undefined,
      });
      return NextResponse.json({
        action: "replay_all",
        type: body.type,
        requeued: count,
      });
    }

    return NextResponse.json(
      {
        error:
          'Acción no válida. Use {"action":"replay","jobId":"..."} o {"action":"replay_all","type":"..."}',
      },
      { status: 400 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/workers/dead-letter]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withObservedRoute({ method: "POST", route: "/api/workers/dead-letter" }, postHandler);
