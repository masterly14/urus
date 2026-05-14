import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

type Params = { params: Promise<{ id: string }> };

/**
 * DELETE /api/invitations/:id
 *
 * Elimina definitivamente una invitación (pendiente, expirada o ya utilizada).
 * Reduce ruido visual en la configuración: las invitaciones aceptadas
 * permanecen en BD por defecto, pero el CEO/Admin puede purgarlas si quiere.
 * Solo accesible para roles CEO o admin.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "No autenticado" },
      { status: 401 },
    );
  }

  if (session.user.role !== "ceo" && session.user.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "Sin permisos" },
      { status: 403 },
    );
  }

  const { id } = await params;
  if (!id?.trim()) {
    return NextResponse.json(
      { ok: false, error: "Identificador de invitación inválido" },
      { status: 400 },
    );
  }

  const invitation = await prisma.invitation.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!invitation) {
    return NextResponse.json(
      { ok: false, error: "Invitación no encontrada" },
      { status: 404 },
    );
  }

  await prisma.invitation.delete({ where: { id } });

  return NextResponse.json({ ok: true, id });
}
