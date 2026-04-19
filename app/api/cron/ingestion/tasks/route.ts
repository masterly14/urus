import { NextResponse } from "next/server";
import { isQstashAuthorized } from "@/lib/api/cron-auth";
import { runTasksIngestionCycle } from "@/lib/workers/ingestion/tasks";
import { classifyError } from "@/lib/workers/ingestion/errors";
import { withObservedRoute } from "@/lib/observability";

// Ver comentario en /api/cron/ingestion/properties/route.ts sobre códigos
// transitorios: devolver 200 evita que QStash reintente y agrave la situación.
const TRANSIENT_ERROR_CODES = new Set([
  "RATE_LIMIT",
  "NETWORK_ERROR",
  "TIMEOUT",
  "DB_ERROR",
]);

const postHandler = async (request: Request) => {
  if (!(await isQstashAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runTasksIngestionCycle();

    if (result.error) {
      const classified = classifyError(new Error(result.error));
      if (TRANSIENT_ERROR_CODES.has(classified.code)) {
        return NextResponse.json(
          { ...result, skipped: true, reason: classified.code.toLowerCase() },
          { status: 200 },
        );
      }
      return NextResponse.json(result, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (err) {
    const classified = classifyError(err);
    const payload = {
      error: classified.message,
      errorCode: classified.code,
      retryable: classified.retryable,
    };
    if (TRANSIENT_ERROR_CODES.has(classified.code)) {
      return NextResponse.json(
        { ...payload, skipped: true, reason: classified.code.toLowerCase() },
        { status: 200 },
      );
    }
    return NextResponse.json(payload, { status: 500 });
  }
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/cron/ingestion/tasks" },
  postHandler,
);

export const maxDuration = 120;
