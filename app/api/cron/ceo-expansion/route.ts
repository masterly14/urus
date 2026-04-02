import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/api/cron-auth";
import { generateAndPersistCeoExpansion } from "@/lib/dashboard/ceo/expansion-generator";

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
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
