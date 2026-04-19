import { NextResponse } from "next/server";
import {
  getSessionFromRequest,
  isCeoOrAdmin,
  unauthorized,
  forbidden,
} from "@/lib/auth/session";
import {
  getLatestCeoExpansion,
  generateAndPersistCeoExpansion,
} from "@/lib/dashboard/ceo/expansion-generator";
import { withObservedRoute } from "@/lib/observability";


const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

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

export const GET = withObservedRoute({ method: "GET", route: "/api/ceo/expansion" }, getHandler);

const postHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

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

export const POST = withObservedRoute({ method: "POST", route: "/api/ceo/expansion" }, postHandler);
