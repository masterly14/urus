import { NextResponse } from "next/server";
import { isQstashAuthorized } from "@/lib/api/cron-auth";
import { runExtrainfoIngestionCycle } from "@/lib/workers/ingestion";
import { withObservedRoute } from "@/lib/observability";

// Errores transitorios: devolvemos 200 con skipped:true para evitar que
// QStash reintente y consuma más cuota del rate limit de Inmovilla.
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

  const result = await runExtrainfoIngestionCycle();

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
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/cron/ingestion/extrainfo" },
  postHandler,
);

// 13s por request + hasta 20 propiedades por run = ~260s. Dejamos 300s de margen.
export const maxDuration = 300;
