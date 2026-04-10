import { NextResponse } from "next/server";
import {
  getSessionFromRequest,
  isCeoOrAdmin,
  unauthorized,
  forbidden,
} from "@/lib/auth/session";
import {
  getLatestCeoDiagnostic,
  generateAndPersistCeoDiagnostic,
} from "@/lib/dashboard/ceo/diagnostic-generator";
import { withObservedRoute } from "@/lib/observability";


const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

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

export const GET = withObservedRoute({ method: "GET", route: "/api/ceo/diagnostic" }, getHandler);

const postHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

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

export const POST = withObservedRoute({ method: "POST", route: "/api/ceo/diagnostic" }, postHandler);
