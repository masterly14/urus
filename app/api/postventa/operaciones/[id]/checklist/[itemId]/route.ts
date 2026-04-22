import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { forbidden, getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { CHECKLIST_ITEM_MAX_LENGTH } from "@/lib/postventa/panel/constants";
import { canDeleteChecklistItem } from "@/lib/postventa/panel/access";

type Params = { params: Promise<{ id: string; itemId: string }> };

const UpdateItemSchema = z.object({
  texto: z.string().trim().min(1).max(CHECKLIST_ITEM_MAX_LENGTH).optional(),
  completado: z.boolean().optional(),
  responsableComercialId: z.string().trim().min(1).nullable().optional(),
  responsableColaboradorId: z.string().trim().min(1).nullable().optional(),
  orden: z.number().int().min(0).optional(),
});

const patchHandler = async (request: Request, { params }: Params) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  const { id: operacionId, itemId } = await params;

  const existing = await prisma.operacionChecklistItem.findFirst({
    where: { id: itemId, operacionId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Ítem no encontrado" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = UpdateItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.texto !== undefined) data.texto = parsed.data.texto;
  if (parsed.data.orden !== undefined) data.orden = parsed.data.orden;
  if (parsed.data.responsableComercialId !== undefined) {
    data.responsableComercialId = parsed.data.responsableComercialId;
  }
  if (parsed.data.responsableColaboradorId !== undefined) {
    data.responsableColaboradorId = parsed.data.responsableColaboradorId;
  }
  if (parsed.data.completado !== undefined) {
    data.completado = parsed.data.completado;
    if (parsed.data.completado && !existing.completado) {
      data.completadoAt = new Date();
      data.completadoByUserId = session.userId;
    } else if (!parsed.data.completado && existing.completado) {
      data.completadoAt = null;
      data.completadoByUserId = null;
    }
  }

  const updated = await prisma.operacionChecklistItem.update({
    where: { id: itemId },
    data,
  });

  return NextResponse.json({
    item: {
      id: updated.id,
      operacionId: updated.operacionId,
      texto: updated.texto,
      completado: updated.completado,
      orden: updated.orden,
      responsableComercialId: updated.responsableComercialId,
      responsableColaboradorId: updated.responsableColaboradorId,
      createdByUserId: updated.createdByUserId,
      completadoByUserId: updated.completadoByUserId,
      completadoAt: updated.completadoAt?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
};

const deleteHandler = async (request: Request, { params }: Params) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  const { id: operacionId, itemId } = await params;

  const existing = await prisma.operacionChecklistItem.findFirst({
    where: { id: itemId, operacionId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Ítem no encontrado" }, { status: 404 });
  }
  if (!canDeleteChecklistItem(session, existing)) return forbidden();

  await prisma.operacionChecklistItem.delete({ where: { id: itemId } });
  return NextResponse.json({ ok: true });
};

export const PATCH = withObservedRoute(
  { method: "PATCH", route: "/api/postventa/operaciones/[id]/checklist/[itemId]" },
  patchHandler,
);

export const DELETE = withObservedRoute(
  { method: "DELETE", route: "/api/postventa/operaciones/[id]/checklist/[itemId]" },
  deleteHandler,
);
