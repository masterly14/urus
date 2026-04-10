import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { token, name, password } = body as {
    token?: string;
    name?: string;
    password?: string;
  };

  if (!token || !name || !password) {
    return NextResponse.json(
      { ok: false, error: "Token, nombre y contraseña son requeridos" },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { ok: false, error: "La contraseña debe tener al menos 8 caracteres" },
      { status: 400 }
    );
  }

  const invitation = await prisma.invitation.findUnique({ where: { token } });

  if (!invitation || invitation.used || invitation.expiresAt < new Date()) {
    return NextResponse.json(
      { ok: false, error: "Invitación inválida o expirada" },
      { status: 400 }
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: invitation.email },
  });
  if (existingUser) {
    return NextResponse.json(
      { ok: false, error: "Ya existe un usuario con ese email" },
      { status: 409 }
    );
  }

  const signUpResult = await auth.api.signUpEmail({
    body: {
      email: invitation.email,
      password,
      name,
    },
  });

  if (!signUpResult?.user) {
    return NextResponse.json(
      { ok: false, error: "Error al crear el usuario" },
      { status: 500 }
    );
  }

  await prisma.user.update({
    where: { id: signUpResult.user.id },
    data: {
      role: invitation.role,
      emailVerified: true,
    },
  });

  await prisma.invitation.update({
    where: { id: invitation.id },
    data: { used: true },
  });

  return NextResponse.json({
    ok: true,
    user: {
      id: signUpResult.user.id,
      email: signUpResult.user.email,
      name: signUpResult.user.name,
      role: invitation.role,
    },
  });
}
