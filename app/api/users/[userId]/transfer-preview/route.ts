import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

type Params = { params: Promise<{ userId: string }> };

/**
 * GET /api/users/:userId/transfer-preview
 *
 * Devuelve cuántas propiedades y demandas quedarían afectadas si se elimina
 * el comercial vinculado al usuario. Usado por el modal de eliminación para
 * informar al CEO antes de confirmar.
 *
 * Respuesta: { ok: true, propertyCount: number, demandCount: number }
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
  }

  if (session.user.role !== "ceo" && session.user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Sin permisos" }, { status: 403 });
  }

  const { userId } = await params;

  if (!userId?.trim()) {
    return NextResponse.json({ ok: false, error: "Usuario inválido" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { comercialId: true },
  });

  if (!user) {
    return NextResponse.json({ ok: false, error: "Usuario no encontrado" }, { status: 404 });
  }

  const comercialId = user.comercialId;

  if (!comercialId) {
    return NextResponse.json({ ok: true, propertyCount: 0, demandCount: 0 });
  }

  const [propertyCount, demandCount] = await Promise.all([
    prisma.propertyCurrent.count({ where: { comercialId } }),
    prisma.demandCurrent.count({ where: { comercialId } }),
  ]);

  return NextResponse.json({ ok: true, propertyCount, demandCount });
}
