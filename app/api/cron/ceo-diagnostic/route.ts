import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/api/cron-auth";
import { generateAndPersistCeoDiagnostic } from "@/lib/dashboard/ceo/diagnostic-generator";
import { withObservedRoute } from "@/lib/observability";


const postHandler = async (request: Request) => {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await generateAndPersistCeoDiagnostic();

    console.log(
      `[cron/ceo-diagnostic] confidence=${result.recommendation.confidence} recos=${result.recommendation.recomendaciones.length} semaforo=${result.recommendation.semaforo_global}`,
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron/ceo-diagnostic] Error:", error);
    return NextResponse.json(
      { error: "Error generando diagnóstico CEO" },
      { status: 500 },
    );
  }
}

export const POST = withObservedRoute({ method: "POST", route: "/api/cron/ceo-diagnostic" }, postHandler);
