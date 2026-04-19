import { NextResponse } from "next/server";
import { isQstashAuthorized } from "@/lib/api/cron-auth";
import { generateAndPersistCeoExpansion } from "@/lib/dashboard/ceo/expansion-generator";
import { withObservedRoute } from "@/lib/observability";


const postHandler = async (request: Request) => {
  if (!(await isQstashAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await generateAndPersistCeoExpansion();

    console.log(
      `[cron/ceo-expansion] readiness=${result.recommendation.readiness_global} ciudades=${result.recommendation.ciudades_recomendadas.length} confidence=${result.recommendation.confidence}`,
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron/ceo-expansion] Error:", error);
    return NextResponse.json(
      { error: "Error evaluando expansión" },
      { status: 500 },
    );
  }
}

export const POST = withObservedRoute({ method: "POST", route: "/api/cron/ceo-expansion" }, postHandler);
