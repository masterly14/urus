import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/api/cron-auth";
import { scanColaboradorSlaBreaches } from "@/lib/operacion/colaboradores";
import { withObservedRoute } from "@/lib/observability";


const postHandler = async (request: Request) => {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await scanColaboradorSlaBreaches();

    console.log(
      `[cron/colaboradores-sla] hitos=${result.hitosEscaneados} breaches=${result.breachesDetectados} eventos=${result.eventosCreados} dedup=${result.deduplicados}`,
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron/colaboradores-sla] Error:", error);
    return NextResponse.json(
      { error: "Error en scan de SLA de colaboradores" },
      { status: 500 },
    );
  }
}

export const POST = withObservedRoute({ method: "POST", route: "/api/cron/colaboradores-sla" }, postHandler);
