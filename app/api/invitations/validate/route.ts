import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ ok: false, error: "Token requerido" }, { status: 400 });
  }

  const invitation = await prisma.invitation.findUnique({ where: { token } });

  if (!invitation) {
    return NextResponse.json({ ok: false, error: "Invitación no encontrada" }, { status: 404 });
  }

  if (invitation.used) {
    return NextResponse.json({ ok: false, error: "Esta invitación ya fue utilizada" }, { status: 410 });
  }

  if (invitation.expiresAt < new Date()) {
    return NextResponse.json({ ok: false, error: "Esta invitación ha expirado" }, { status: 410 });
  }

  return NextResponse.json({
    ok: true,
    email: invitation.email,
    role: invitation.role,
  });
}
