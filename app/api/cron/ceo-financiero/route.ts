import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/api/cron-auth";
import { generateAndPersistCeoFinancial } from "@/lib/dashboard/ceo/financial-generator";

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await generateAndPersistCeoFinancial();

    console.log(
      `[cron/ceo-financiero] semaforo=${result.recommendation.semaforo_financiero} roi_total=${result.recommendation.roi_automatizaciones_total}% confidence=${result.recommendation.confidence}`,
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron/ceo-financiero] Error:", error);
    return NextResponse.json(
      { error: "Error generando análisis financiero" },
      { status: 500 },
    );
  }
}
