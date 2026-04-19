import { NextResponse } from "next/server";
import { isQstashAuthorized } from "@/lib/api/cron-auth";
import { runPropertiesIngestionCycle } from "@/lib/workers/ingestion";
import { withObservedRoute } from "@/lib/observability";


// Códigos de error transitorios que NO deben devolver 500 al cron scheduler.
// Si devolviéramos 500, QStash reintentaría y agravaría el problema
// (e.g. reintentos consumen más peticiones del rate limit de Inmovilla,
// manteniendo la ventana 50/10min saturada). Devolvemos 200 con skipped:true
// para que el scheduler considere el ciclo como "ok, saltado" y NO reintente;
// el siguiente cron programado reanudará automáticamente cuando la ventana
// se haya vaciado o el error transitorio haya pasado.
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

  const result = await runPropertiesIngestionCycle();

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

export const POST = withObservedRoute({ method: "POST", route: "/api/cron/ingestion/properties" }, postHandler);

// With 13s per REST request and N properties, large catalogues can take >2min.
// Vercel Pro allows up to 300s; set to max to avoid premature timeout.
export const maxDuration = 300;
