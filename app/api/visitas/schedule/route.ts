import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  getSessionFromRequest,
  isCeoOrAdmin,
  unauthorized,
} from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { scheduleManualVisit } from "@/lib/visitas/manual-schedule";
import { getVisitWorkItem } from "@/lib/visitas/work-items";

const BodySchema = z.object({
  visitId: z.string().min(1).optional(),
  demandId: z.string().min(1).optional(),
  propertyId: z.string().min(1).optional(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  horaInicio: z.string().regex(/^\d{2}:\d{2}$/),
  horaFin: z.string().regex(/^\d{2}:\d{2}$/),
  comercialId: z.string().optional(),
  notas: z.string().optional(),
});

const postHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const body = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Input inválido", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const workItem = parsed.data.visitId
    ? await getVisitWorkItem(parsed.data.visitId)
    : null;
  if (parsed.data.visitId && !workItem) {
    return NextResponse.json(
      { ok: false, error: "Visita pre-creada no encontrada" },
      { status: 404 },
    );
  }

  const demandId = parsed.data.demandId ?? workItem?.demandId;
  const propertyId = parsed.data.propertyId ?? workItem?.propertyId;
  if (!demandId || !propertyId) {
    return NextResponse.json(
      { ok: false, error: "Debe indicar demandId/propertyId o un visitId válido" },
      { status: 400 },
    );
  }
  if (
    workItem &&
    ((parsed.data.demandId && parsed.data.demandId !== workItem.demandId) ||
      (parsed.data.propertyId && parsed.data.propertyId !== workItem.propertyId))
  ) {
    return NextResponse.json(
      { ok: false, error: "La visita pre-creada no coincide con la demanda o propiedad indicada" },
      { status: 400 },
    );
  }

  const effectiveComercialId = parsed.data.comercialId ?? workItem?.comercialId ?? session.comercialId;
  if (!effectiveComercialId) {
    return NextResponse.json(
      { ok: false, error: "Sin comercial asociado para agendar la visita" },
      { status: 400 },
    );
  }

  if (!isCeoOrAdmin(session.role) && effectiveComercialId !== session.comercialId) {
    return NextResponse.json(
      { ok: false, error: "No puedes agendar visitas para otro comercial" },
      { status: 403 },
    );
  }

  if (!isCeoOrAdmin(session.role) && workItem && workItem.comercialId !== session.comercialId) {
    return NextResponse.json(
      { ok: false, error: "No puedes agendar visitas para otro comercial" },
      { status: 403 },
    );
  }

  const demand = await prisma.demandCurrent.findUnique({
    where: { codigo: demandId },
    select: { comercialId: true },
  });
  if (!demand) {
    return NextResponse.json(
      { ok: false, error: "Demanda no encontrada" },
      { status: 404 },
    );
  }
  if (!isCeoOrAdmin(session.role) && demand.comercialId !== session.comercialId) {
    return NextResponse.json(
      { ok: false, error: "No puedes agendar esta demanda" },
      { status: 403 },
    );
  }

  try {
    const result = await scheduleManualVisit({
      ...parsed.data,
      visitWorkItemId: workItem?.id,
      demandId,
      propertyId,
      comercialId: effectiveComercialId,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    const status = message.includes("no encontrada") ? 404 : 409;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/visitas/schedule" },
  postHandler,
);
