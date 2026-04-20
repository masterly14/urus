import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import {
  CHECKLIST_ITEM_MAX_LENGTH,
  CHECKLIST_MAX_ITEMS,
} from "@/lib/postventa/panel/constants";
import type { PanelChecklistItemDTO } from "@/lib/postventa/panel/types";

type Params = { params: Promise<{ id: string }> };

const CreateItemSchema = z.object({
  texto: z.string().trim().min(1).max(CHECKLIST_ITEM_MAX_LENGTH),
  responsableComercialId: z.string().trim().min(1).nullable().optional(),
});

type ItemRow = {
  id: string;
  operacionId: string;
  texto: string;
  completado: boolean;
  orden: number;
  responsableComercialId: string | null;
  createdByUserId: string;
  completadoByUserId: string | null;
  completadoAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

async function toDTOs(items: ItemRow[]): Promise<PanelChecklistItemDTO[]> {
  const comercialIds = Array.from(
    new Set(
      items
        .map((i) => i.responsableComercialId)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const nombres = new Map<string, string>();
  if (comercialIds.length > 0) {
    const comerciales = await prisma.comercial.findMany({
      where: { id: { in: comercialIds } },
      select: { id: true, nombre: true },
    });
    for (const c of comerciales) nombres.set(c.id, c.nombre);
  }

  return items.map((i) => ({
    id: i.id,
    operacionId: i.operacionId,
    texto: i.texto,
    completado: i.completado,
    orden: i.orden,
    responsableComercialId: i.responsableComercialId,
    responsableNombre: i.responsableComercialId
      ? nombres.get(i.responsableComercialId) ?? null
      : null,
    createdByUserId: i.createdByUserId,
    completadoByUserId: i.completadoByUserId,
    completadoAt: i.completadoAt?.toISOString() ?? null,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  }));
}

/**
 * GET /api/postventa/operaciones/:id/checklist
 * Todos los usuarios autenticados ven todos los ítems de la operación.
 */
const getHandler = async (request: Request, { params }: Params) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  const { id: operacionId } = await params;

  const operacion = await prisma.operacion.findUnique({
    where: { id: operacionId },
    select: { id: true },
  });
  if (!operacion) {
    return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 });
  }

  const items = await prisma.operacionChecklistItem.findMany({
    where: { operacionId },
    orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ items: await toDTOs(items) });
};

/**
 * POST /api/postventa/operaciones/:id/checklist
 * Añade un ítem al final de la lista (orden = max+1).
 */
const postHandler = async (request: Request, { params }: Params) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  const { id: operacionId } = await params;

  const body = await request.json().catch(() => null);
  const parsed = CreateItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const operacion = await prisma.operacion.findUnique({
    where: { id: operacionId },
    select: { id: true },
  });
  if (!operacion) {
    return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 });
  }

  const count = await prisma.operacionChecklistItem.count({ where: { operacionId } });
  if (count >= CHECKLIST_MAX_ITEMS) {
    return NextResponse.json(
      { error: `Máximo ${CHECKLIST_MAX_ITEMS} ítems por operación` },
      { status: 400 },
    );
  }

  const last = await prisma.operacionChecklistItem.findFirst({
    where: { operacionId },
    orderBy: { orden: "desc" },
    select: { orden: true },
  });
  const nextOrden = (last?.orden ?? -1) + 1;

  const item = await prisma.operacionChecklistItem.create({
    data: {
      operacionId,
      texto: parsed.data.texto,
      orden: nextOrden,
      responsableComercialId: parsed.data.responsableComercialId ?? null,
      createdByUserId: session.userId,
    },
  });

  const [dto] = await toDTOs([item]);
  return NextResponse.json({ item: dto }, { status: 201 });
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/postventa/operaciones/[id]/checklist" },
  getHandler,
);

export const POST = withObservedRoute(
  { method: "POST", route: "/api/postventa/operaciones/[id]/checklist" },
  postHandler,
);
