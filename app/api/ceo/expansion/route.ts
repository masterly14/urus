import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  getLatestCeoExpansion,
  generateAndPersistCeoExpansion,
} from "@/lib/dashboard/ceo/expansion-generator";

export async function GET(request: Request) {
  const session = getSession(request);

  if (session.role !== "ceo") {
    return NextResponse.json(
      { error: "Acceso restringido al CEO" },
      { status: 403 },
    );
  }

  try {
    const result = await getLatestCeoExpansion();

    if (!result) {
      return NextResponse.json(
        { ok: true, recommendation: null, generatedAt: null },
      );
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/ceo/expansion] GET Error:", message);
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
    const result = await generateAndPersistCeoExpansion();

    console.log(
      `[api/ceo/expansion] POST readiness=${result.recommendation.readiness_global} ciudades=${result.recommendation.ciudades_recomendadas.length} confidence=${result.recommendation.confidence}`,
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/ceo/expansion] POST Error:", message);
    return NextResponse.json(
      { error: "Error evaluando expansión" },
      { status: 500 },
    );
  }
}
