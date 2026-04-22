import { NextResponse } from "next/server";
import { withObservedRoute } from "@/lib/observability";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { cancelOperacion } from "@/lib/operacion/close";

type Params = { params: Promise<{ id: string }> };

const patchHandler = async (request: Request, { params }: Params) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  const { id: operacionId } = await params;

  const comercialId = session.comercialId ?? session.userId;

  const result = await cancelOperacion(operacionId, comercialId);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
};

export const PATCH = withObservedRoute(
  { method: "PATCH", route: "/api/operaciones/[id]/cancelar" },
  patchHandler,
);
