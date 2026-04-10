import { NextResponse } from "next/server";
import {
  getSessionFromRequest,
  isCeoOrAdmin,
  unauthorized,
  forbidden,
} from "@/lib/auth/session";
import {
  getLatestCeoFinancial,
  generateAndPersistCeoFinancial,
} from "@/lib/dashboard/ceo/financial-generator";
import { withObservedRoute } from "@/lib/observability";


const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

  try {
    const result = await getLatestCeoFinancial();

    if (!result) {
      return NextResponse.json(
        { ok: true, recommendation: null, generatedAt: null },
      );
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

export const GET = withObservedRoute({ method: "GET", route: "/api/ceo/financiero" }, getHandler);

const postHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

  try {
    const result = await generateAndPersistCeoFinancial();

    console.log(
      `[api/ceo/financiero] POST semaforo=${result.recommendation.semaforo_financiero} reinversion=${result.recommendation.capacidad_reinversion_eur} confidence=${result.recommendation.confidence}`,
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/ceo/financiero] POST Error:", message);
    return NextResponse.json(
      { error: "Error analizando finanzas" },
      { status: 500 },
    );
  }
}

export const POST = withObservedRoute({ method: "POST", route: "/api/ceo/financiero" }, postHandler);
