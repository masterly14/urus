import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { NOTA_MAX_LENGTH } from "@/lib/postventa/panel/constants";
import { canMutateNota, isPrivileged } from "@/lib/postventa/panel/access";
import type { PanelNotaDTO } from "@/lib/postventa/panel/types";

type Params = { params: Promise<{ id: string }> };

const CreateNotaSchema = z.object({
  content: z.string().trim().min(1).max(NOTA_MAX_LENGTH),
});

function toDTO(
  nota: {
    id: string;
    operacionId: string;
    authorUserId: string;
    authorName: string;
    authorRole: string;
    content: string;
    createdAt: Date;
    updatedAt: Date;
  },
  session: { userId: string; role: "ceo" | "admin" | "comercial" },
): PanelNotaDTO {
  return {
    id: nota.id,
    operacionId: nota.operacionId,
    authorUserId: nota.authorUserId,
    authorName: nota.authorName,
    authorRole: (nota.authorRole as PanelNotaDTO["authorRole"]) ?? "comercial",
    content: nota.content,
    createdAt: nota.createdAt.toISOString(),
    updatedAt: nota.updatedAt.toISOString(),
    canEdit: canMutateNota(session, nota),
  };
}

/**
 * GET /api/postventa/operaciones/:id/notas
 * - CEO/admin: todas las notas de la operación.
 * - comercial: solo las notas de las que es autor.
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

  const where = isPrivileged(session.role)
    ? { operacionId }
    : { operacionId, authorUserId: session.userId };

  const notas = await prisma.operacionNota.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    notas: notas.map((n) => toDTO(n, session)),
  });
};

/**
 * POST /api/postventa/operaciones/:id/notas
 * Crea una nota interna. El autor queda registrado con la identidad del
 * usuario de sesión (inmutable).
 */
const postHandler = async (request: Request, { params }: Params) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  const { id: operacionId } = await params;

  const body = await request.json().catch(() => null);
  const parsed = CreateNotaSchema.safeParse(body);
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

  const nota = await prisma.operacionNota.create({
    data: {
      operacionId,
      authorUserId: session.userId,
      authorName: session.nombre,
      authorRole: session.role,
      content: parsed.data.content,
    },
  });

  return NextResponse.json({ nota: toDTO(nota, session) }, { status: 201 });
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/postventa/operaciones/[id]/notas" },
  getHandler,
);

export const POST = withObservedRoute(
  { method: "POST", route: "/api/postventa/operaciones/[id]/notas" },
  postHandler,
);
