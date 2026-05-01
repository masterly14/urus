import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  getSessionFromRequest,
  isCeoOrAdmin,
  unauthorized,
} from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { createManualVisitWorkItem, serializeVisitWorkItem } from "@/lib/visitas/work-items";

const BodySchema = z.object({
  demandId: z.string().min(1),
  propertyId: z.string().min(1),
  nluSummary: z.string().optional(),
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

  const demand = await prisma.demandCurrent.findUnique({
    where: { codigo: parsed.data.demandId },
    select: { comercialId: true, telefono: true },
  });
  if (!demand) {
    return NextResponse.json({ ok: false, error: "Demanda no encontrada" }, { status: 404 });
  }

  const comercialId = demand.comercialId ?? session.comercialId;
  if (!comercialId) {
    return NextResponse.json({ ok: false, error: "Sin comercial asociado" }, { status: 400 });
  }
  if (!isCeoOrAdmin(session.role) && comercialId !== session.comercialId) {
    return NextResponse.json(
      { ok: false, error: "No puedes crear visitas para otra demanda" },
      { status: 403 },
    );
  }
  if (!demand.telefono?.trim()) {
    return NextResponse.json(
      { ok: false, error: "La demanda no tiene teléfono. Completa el teléfono antes de crear la visita manual." },
      { status: 400 },
    );
  }

  try {
    const { workItem, created } = await createManualVisitWorkItem({
      demandId: parsed.data.demandId,
      propertyId: parsed.data.propertyId,
      comercialId,
      nluSummary: parsed.data.nluSummary,
    });

    return NextResponse.json({
      ok: true,
      created,
      workItem: serializeVisitWorkItem(workItem),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error creando visita manual";
    const status = message.includes("no encontrada") ? 404 : 409;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/visitas/manual" },
  postHandler,
);
