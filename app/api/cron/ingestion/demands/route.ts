import { NextResponse } from "next/server";
import { isQstashAuthorized } from "@/lib/api/cron-auth";
import { runDemandsIngestionCycle } from "@/lib/workers/ingestion";
import { withObservedRoute } from "@/lib/observability";

// Ver comentario en /api/cron/ingestion/properties/route.ts sobre códigos
// transitorios: devolver 200 evita que QStash retrique y agrave la situación
// (rate limit, DB caída, timeout). El siguiente cron programado reanuda.
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

  const result = await runDemandsIngestionCycle();

  if (result.error) {
    const code = result.errorCode ?? "UNKNOWN";
    if (TRANSIENT_ERROR_CODES.has(code)) {
      return NextResponse.json(
        { ...result, skipped: true, reason: code.toLowerCase() },
        { status: 200 },
      );
    }
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result);
}

export const POST = withObservedRoute({ method: "POST", route: "/api/cron/ingestion/demands" }, postHandler);

export const maxDuration = 120;
