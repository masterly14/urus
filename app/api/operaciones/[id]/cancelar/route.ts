import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withObservedRoute } from "@/lib/observability";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { canAccessOperacion, OPERACION_FORBIDDEN_ERROR } from "@/lib/operacion/access";
import { cancelOperacion } from "@/lib/operacion/close";

type Params = { params: Promise<{ id: string }> };

const patchHandler = async (request: Request, { params }: Params) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  const { id: operacionId } = await params;

  const comercialId = session.comercialId ?? session.userId;
  const operacion = await prisma.operacion.findUnique({
    where: { id: operacionId },
    select: { comercialId: true },
  });
  if (!operacion) {
    return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 });
  }
  if (!canAccessOperacion(session, operacion)) {
    return NextResponse.json({ error: OPERACION_FORBIDDEN_ERROR }, { status: 403 });
  }

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
