import { NextResponse } from "next/server";
import { isQstashAuthorized } from "@/lib/api/cron-auth";
import { generateAndPersistCeoFinancial } from "@/lib/dashboard/ceo/financial-generator";
import { withObservedRoute } from "@/lib/observability";


const postHandler = async (request: Request) => {
  if (!(await isQstashAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await generateAndPersistCeoFinancial();

    console.log(
      `[cron/ceo-financiero] semaforo=${result.recommendation.semaforo_financiero} reinversion=${result.recommendation.capacidad_reinversion_eur} confidence=${result.recommendation.confidence}`,
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron/ceo-financiero] Error:", error);
    return NextResponse.json(
      { error: "Error analizando finanzas" },
      { status: 500 },
    );
  }
}

export const POST = withObservedRoute({ method: "POST", route: "/api/cron/ceo-financiero" }, postHandler);
