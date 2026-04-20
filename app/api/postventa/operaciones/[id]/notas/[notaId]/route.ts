import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { forbidden, getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { NOTA_MAX_LENGTH } from "@/lib/postventa/panel/constants";
import { canMutateNota, canViewNota } from "@/lib/postventa/panel/access";

type Params = { params: Promise<{ id: string; notaId: string }> };

const UpdateNotaSchema = z.object({
  content: z.string().trim().min(1).max(NOTA_MAX_LENGTH),
});

async function loadNota(operacionId: string, notaId: string) {
  return prisma.operacionNota.findFirst({
    where: { id: notaId, operacionId },
  });
}

const patchHandler = async (request: Request, { params }: Params) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  const { id: operacionId, notaId } = await params;

  const nota = await loadNota(operacionId, notaId);
  if (!nota) {
    return NextResponse.json({ error: "Nota no encontrada" }, { status: 404 });
  }
  if (!canViewNota(session, nota)) return forbidden();
  if (!canMutateNota(session, nota)) return forbidden();

  const body = await request.json().catch(() => null);
  const parsed = UpdateNotaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const updated = await prisma.operacionNota.update({
    where: { id: notaId },
    data: { content: parsed.data.content },
  });

  return NextResponse.json({
    nota: {
      id: updated.id,
      operacionId: updated.operacionId,
      authorUserId: updated.authorUserId,
      authorName: updated.authorName,
      authorRole: updated.authorRole,
      content: updated.content,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      canEdit: true,
    },
  });
};

const deleteHandler = async (request: Request, { params }: Params) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  const { id: operacionId, notaId } = await params;

  const nota = await loadNota(operacionId, notaId);
  if (!nota) {
    return NextResponse.json({ error: "Nota no encontrada" }, { status: 404 });
  }
  if (!canMutateNota(session, nota)) return forbidden();

  await prisma.operacionNota.delete({ where: { id: notaId } });
  return NextResponse.json({ ok: true });
};

export const PATCH = withObservedRoute(
  { method: "PATCH", route: "/api/postventa/operaciones/[id]/notas/[notaId]" },
  patchHandler,
);

export const DELETE = withObservedRoute(
  { method: "DELETE", route: "/api/postventa/operaciones/[id]/notas/[notaId]" },
  deleteHandler,
);
