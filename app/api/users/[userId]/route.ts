import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

type Params = { params: Promise<{ userId: string }> };

/**
 * DELETE /api/users/:userId — Solo CEO/Admin. Solo permite eliminar usuarios comerciales.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
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

  if (session.user.id === userId) {
    return NextResponse.json(
      { ok: false, error: "No puedes eliminar tu propia cuenta" },
      { status: 400 },
    );
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });

  if (!target) {
    return NextResponse.json({ ok: false, error: "Usuario no encontrado" }, { status: 404 });
  }

  if (target.role !== "comercial") {
    return NextResponse.json(
      { ok: false, error: "Solo se pueden eliminar usuarios con rol comercial" },
      { status: 400 },
    );
  }

  await prisma.user.delete({ where: { id: userId } });

  return NextResponse.json({ ok: true });
}
