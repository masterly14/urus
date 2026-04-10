import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { sendInvitationEmail } from "@/lib/email/resend";

const PostBodySchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "comercial"]),
});

const INVITATION_EXPIRY_DAYS = 7;

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

  const { email, role } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { ok: false, error: "Ya existe un usuario con ese email" },
      { status: 409 }
    );
  }

  const pendingInvite = await prisma.invitation.findFirst({
    where: { email, used: false, expiresAt: { gt: new Date() } },
  });
  if (pendingInvite) {
    return NextResponse.json(
      { ok: false, error: "Ya existe una invitación pendiente para ese email" },
      { status: 409 }
    );
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const invitation = await prisma.invitation.create({
    data: {
      email,
      role,
      token,
      expiresAt,
      invitedBy: session.user.id,
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const registerUrl = `${appUrl}/register?token=${token}`;

  await sendInvitationEmail({
    to: email,
    inviterName: session.user.name,
    role,
    registerUrl,
  });

  return NextResponse.json({
    ok: true,
    invitation: { id: invitation.id, email, role, expiresAt: invitation.expiresAt },
  });
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
  }

  const userRole = session.user.role;
  if (userRole !== "ceo" && userRole !== "admin") {
    return NextResponse.json({ ok: false, error: "Sin permisos" }, { status: 403 });
  }

  const invitations = await prisma.invitation.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ ok: true, invitations });
}
