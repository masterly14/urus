import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";

type Params = { params: Promise<{ id: string }> };

const ReorderSchema = z.object({
  /** Lista de IDs de ítems en el nuevo orden (de 0 a N-1). */
  itemIds: z.array(z.string().min(1)).min(1).max(200),
});

/**
 * POST /api/postventa/operaciones/:id/checklist/reorder
 * Re-asigna el campo `orden` en bloque. Sólo reordena los ítems
 * que pertenecen a la operación indicada; si hay IDs ajenos, se rechazan.
 */
const postHandler = async (request: Request, { params }: Params) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  const { id: operacionId } = await params;

  const body = await request.json().catch(() => null);
  const parsed = ReorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const ids = parsed.data.itemIds;
  const existing = await prisma.operacionChecklistItem.findMany({
    where: { operacionId, id: { in: ids } },
    select: { id: true },
  });
  if (existing.length !== ids.length) {
    return NextResponse.json(
      { error: "Algunos ítems no existen o no pertenecen a esta operación" },
      { status: 400 },
    );
  }

  await prisma.$transaction(
    ids.map((id, idx) =>
      prisma.operacionChecklistItem.update({
        where: { id },
        data: { orden: idx },
      }),
    ),
  );

  return NextResponse.json({ ok: true });
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/postventa/operaciones/[id]/checklist/reorder" },
  postHandler,
);
