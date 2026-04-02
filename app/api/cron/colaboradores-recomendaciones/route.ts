import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/api/cron-auth";
import { generateAndPersistColaboradoresRecommendation } from "@/lib/operacion/colaboradores/recommendation-generator";

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
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
