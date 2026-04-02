import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  getLatestCeoFinancial,
  generateAndPersistCeoFinancial,
} from "@/lib/dashboard/ceo/financial-generator";

export async function GET(request: Request) {
  const session = getSession(request);

  if (session.role !== "ceo") {
    return NextResponse.json(
      { error: "Acceso restringido al CEO" },
      { status: 403 },
    );
  }

  try {
    const result = await getLatestCeoFinancial();

    if (!result) {
      return NextResponse.json({ ok: true, recommendation: null, generatedAt: null });
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/ceo/financiero] GET Error:", message);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const session = getSession(request);

  if (session.role !== "ceo") {
    return NextResponse.json(
      { error: "Acceso restringido al CEO" },
      { status: 403 },
    );
  }

  try {
    const result = await generateAndPersistCeoFinancial();

    console.log(
      `[api/ceo/financiero] POST semaforo=${result.recommendation.semaforo_financiero} roi_total=${result.recommendation.roi_automatizaciones_total}% confidence=${result.recommendation.confidence}`,
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/ceo/financiero] POST Error:", message);
    return NextResponse.json(
      { error: "Error generando análisis financiero" },
      { status: 500 },
    );
  }
}
