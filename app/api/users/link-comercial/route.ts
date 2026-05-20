import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

/**
 * POST /api/users/link-comercial
 *
 * Vincula un User (role=comercial) a una ficha Comercial.
 *
 * Seguridad contra huérfanos:
 * - Si el User ya tenía un Comercial distinto vinculado (reasignación),
 *   el Comercial anterior se marca activo=false para que el resolver
 *   no lo use como destino de leads/WhatsApp.
 * - Invalida la caché "users-list" tras el cambio.
 */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
  }

  const userRole = session.user.role;
  if (userRole !== "ceo" && userRole !== "admin") {
    return NextResponse.json({ ok: false, error: "Sin permisos" }, { status: 403 });
  }

  const body = await request.json();
  const { userId, comercialId } = body as { userId?: string; comercialId?: string };

  if (!userId || !comercialId) {
    return NextResponse.json(
      { ok: false, error: "userId y comercialId requeridos" },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, comercialId: true },
  });
  if (!user || user.role !== "comercial") {
    return NextResponse.json(
      { ok: false, error: "Usuario no encontrado o no es comercial" },
      { status: 404 },
    );
  }

  const comercial = await prisma.comercial.findUnique({ where: { id: comercialId } });
  if (!comercial) {
    return NextResponse.json(
      { ok: false, error: "Comercial no encontrado" },
      { status: 404 },
    );
  }

  const existingLink = await prisma.user.findFirst({
    where: { comercialId, id: { not: userId } },
  });
  if (existingLink) {
    return NextResponse.json(
      { ok: false, error: "Este comercial ya está vinculado a otro usuario" },
      { status: 409 },
    );
  }

  const previousComercialId = user.comercialId;
  const isReasignment = previousComercialId && previousComercialId !== comercialId;

  await prisma.$transaction(async (tx) => {
    // Si el User tenía otro Comercial vinculado, marcarlo inactivo para evitar
    // que quede como huérfano activo recibiendo leads y WhatsApp.
    if (isReasignment) {
      await tx.comercial.update({
        where: { id: previousComercialId },
        data: { activo: false },
      });
    }

    await tx.user.update({
      where: { id: userId },
      data: { comercialId },
    });
  });

  revalidateTag("users-list", { expire: 0 });

  return NextResponse.json({ ok: true });
}
