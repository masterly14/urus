import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

const BodySchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["ceo", "admin", "comercial"]),
});

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
  }

  const actorRole = session.user.role;
  if (actorRole !== "ceo" && actorRole !== "admin") {
    return NextResponse.json({ ok: false, error: "Sin permisos" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Input inválido", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { userId, role } = parsed.data;

  if (role === "ceo" && actorRole !== "ceo") {
    return NextResponse.json(
      { ok: false, error: "Solo un CEO puede asignar el rol CEO" },
      { status: 403 },
    );
  }

  if (session.user.id === userId) {
    return NextResponse.json(
      { ok: false, error: "No puedes cambiar tu propio rol" },
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

  if (target.role === role) {
    return NextResponse.json({ ok: true });
  }

  if (target.role === "ceo" && role !== "ceo") {
    const ceoCount = await prisma.user.count({ where: { role: "ceo" } });
    if (ceoCount <= 1) {
      return NextResponse.json(
        { ok: false, error: "Debe existir al menos un usuario con rol CEO" },
        { status: 400 },
      );
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      role,
      // Si deja de ser comercial, se libera la vinculación.
      ...(role === "comercial" ? {} : { comercialId: null }),
    },
  });

  return NextResponse.json({ ok: true });
}
