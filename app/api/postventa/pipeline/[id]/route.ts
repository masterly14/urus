import { NextResponse } from "next/server";
import { withObservedRoute } from "@/lib/observability";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { getPostventaPipelineOperation } from "@/lib/postventa/pipeline-read-model";

const getHandler = async (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const { id } = await context.params;

  try {
    const operation = await getPostventaPipelineOperation(id);
    if (!operation) {
      return NextResponse.json(
        { error: "Operación post-venta no encontrada" },
        { status: 404 },
      );
    }
    return NextResponse.json(operation);
  } catch (error) {
    console.error(`[api/postventa/pipeline/${id}] GET error:`, error);
    return NextResponse.json(
      { error: "Error al obtener operación post-venta" },
      { status: 500 },
    );
  }
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/postventa/pipeline/:id" },
  getHandler,
);
