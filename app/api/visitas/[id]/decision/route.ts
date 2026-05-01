import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getSessionFromRequest,
  isCeoOrAdmin,
  unauthorized,
} from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { getVisitWorkItem } from "@/lib/visitas/work-items";
import { decideVisitWorkItem } from "@/lib/visitas/decisions";

type RouteContext = { params: Promise<{ id: string }> };

const BodySchema = z.object({
  decision: z.enum(["green", "yellow", "red"]),
  notes: z.string().optional(),
  reason: z.string().optional(),
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
      { ok: false, error: "No puedes decidir una visita de otro comercial" },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Input inválido", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const result = await decideVisitWorkItem({
      visitWorkItemId: id,
      decision: parsed.data.decision,
      notes: parsed.data.notes,
      reason: parsed.data.reason,
      decidedBy: session.nombre ?? session.email ?? session.userId,
    });

    return NextResponse.json({
      ok: true,
      decision: parsed.data.decision,
      workItem: result.workItem,
      decisionEventId: result.decisionEventId,
      branchEventId: result.branchEventId,
      operacion: result.operacion,
      deactivate: result.deactivate,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ ok: false, error: message }, { status: 409 });
  }
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/visitas/[id]/decision" },
  postHandler,
);
