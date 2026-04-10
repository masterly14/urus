import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

const PostBodySchema = z.object({
  token: z.string(),
  name: z.string().min(1),
  password: z.string().min(8),
});

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = PostBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "Input inválido",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const { token, name, password } = parsed.data;

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
