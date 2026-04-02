import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  getLatestCeoDiagnostic,
  generateAndPersistCeoDiagnostic,
} from "@/lib/dashboard/ceo/diagnostic-generator";

export async function GET(request: Request) {
  const session = getSession(request);

  if (session.role !== "ceo") {
    return NextResponse.json(
      { error: "Acceso restringido al CEO" },
      { status: 403 },
    );
  }

  try {
    const result = await getLatestCeoDiagnostic();

    if (!result) {
      return NextResponse.json(
        { ok: true, recommendation: null, generatedAt: null },
      );
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/ceo/diagnostic] GET Error:", message);
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
    const result = await generateAndPersistCeoDiagnostic();

    console.log(
      `[api/ceo/diagnostic] POST confidence=${result.recommendation.confidence} recos=${result.recommendation.recomendaciones.length} semaforo=${result.recommendation.semaforo_global}`,
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/ceo/diagnostic] POST Error:", message);
    return NextResponse.json(
      { error: "Error generando diagnóstico CEO" },
      { status: 500 },
    );
  }
}
