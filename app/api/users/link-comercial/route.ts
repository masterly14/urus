import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

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
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== "comercial") {
    return NextResponse.json(
      { ok: false, error: "Usuario no encontrado o no es comercial" },
      { status: 404 }
    );
  }

  const comercial = await prisma.comercial.findUnique({ where: { id: comercialId } });
  if (!comercial) {
    return NextResponse.json(
      { ok: false, error: "Comercial no encontrado" },
      { status: 404 }
    );
  }

  const existingLink = await prisma.user.findFirst({
    where: { comercialId, id: { not: userId } },
  });
  if (existingLink) {
    return NextResponse.json(
      { ok: false, error: "Este comercial ya está vinculado a otro usuario" },
      { status: 409 }
    );
  }

  await prisma.user.update({
    where: { id: userId },
    data: { comercialId },
  });

  return NextResponse.json({ ok: true });
}
