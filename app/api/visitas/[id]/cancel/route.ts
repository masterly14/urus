import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getSessionFromRequest,
  isCeoOrAdmin,
  unauthorized,
} from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { getVisitWorkItem } from "@/lib/visitas/work-items";
import { cancelManualVisit } from "@/lib/visitas/manual-schedule";

type RouteContext = { params: Promise<{ id: string }> };

const BodySchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

const postHandler = async (request: Request, context: RouteContext) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const { id } = await context.params;
  const workItem = await getVisitWorkItem(id);
  if (!workItem) {
    return NextResponse.json(
      { ok: false, error: "Visita pre-creada no encontrada" },
      { status: 404 },
    );
  }

  if (!isCeoOrAdmin(session.role) && workItem.comercialId !== session.comercialId) {
    return NextResponse.json(
      { ok: false, error: "No puedes cancelar una visita de otro comercial" },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Input inválido", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const result = await cancelManualVisit({
      visitWorkItemId: id,
      comercialId: workItem.comercialId,
      reason: parsed.data.reason,
      cancelledBy: "commercial",
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ ok: false, error: message }, { status: 409 });
  }
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/visitas/[id]/cancel" },
  postHandler,
);
