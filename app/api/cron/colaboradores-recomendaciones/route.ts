import { NextResponse } from "next/server";
import { isQstashAuthorized } from "@/lib/api/cron-auth";
import { generateAndPersistColaboradoresRecommendation } from "@/lib/operacion/colaboradores/recommendation-generator";
import { withObservedRoute } from "@/lib/observability";


const postHandler = async (request: Request) => {
  if (!(await isQstashAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await generateAndPersistColaboradoresRecommendation();

    console.log(
      `[cron/colaboradores-recomendaciones] colaboradores=${result.colaboradoresAnalizados} confidence=${result.recommendation.confidence} recos=${result.recommendation.recomendaciones.length}`,
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron/colaboradores-recomendaciones] Error:", error);
    return NextResponse.json(
      { error: "Error generando recomendaciones de colaboradores" },
      { status: 500 },
    );
  }
}

export const POST = withObservedRoute({ method: "POST", route: "/api/cron/colaboradores-recomendaciones" }, postHandler);
