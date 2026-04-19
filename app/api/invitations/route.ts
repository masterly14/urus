import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { sendInvitationEmail } from "@/lib/email/resend";
import { normalizeSpainPhoneLocalInput } from "@/lib/phone/es";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";

const PostBodySchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "comercial"]),
  /** Nombre del invitado (lo define quien envía la invitación). */
  invitedName: z.string().min(1).max(200),
  /** Número tras +34 (España). Obligatorio para comercial; opcional para admin. */
  invitedPhoneLocal: z.string().optional(),
  /** Iniciales del comercial en las refs de Inmovilla (ej. "MA", "FEDE"). Obligatorio para rol comercial. */
  refCode: z.string().max(10).optional(),
});

const INVITATION_EXPIRY_DAYS = 7;

const INVITATION_RATE_LIMIT = { windowMs: 60_000, maxRequests: 5 } as const;

export async function POST(request: NextRequest) {
  const rl = checkRateLimit(request, "invitations:post", INVITATION_RATE_LIMIT);
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

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

  const { email, role, refCode, invitedName, invitedPhoneLocal } = parsed.data;
  const normalizedRefCode = refCode?.trim().toUpperCase() || null;

  if (role === "comercial" && !normalizedRefCode) {
    return NextResponse.json(
      { ok: false, error: "Las iniciales en Inmovilla son obligatorias para comerciales." },
      { status: 400 },
    );
  }

  let invitedPhoneStored = "";
  if (role === "comercial") {
    if (!invitedPhoneLocal?.trim()) {
      return NextResponse.json(
        { ok: false, error: "El teléfono del comercial es obligatorio." },
        { status: 400 },
      );
    }
    const normalizedPhone = normalizeSpainPhoneLocalInput(invitedPhoneLocal);
    if (!normalizedPhone) {
      return NextResponse.json(
        { ok: false, error: "Teléfono no válido. Introduce 9 dígitos (España, +34)." },
        { status: 400 },
      );
    }
    invitedPhoneStored = normalizedPhone;
  } else if (invitedPhoneLocal?.trim()) {
    const normalizedPhone = normalizeSpainPhoneLocalInput(invitedPhoneLocal);
    if (!normalizedPhone) {
      return NextResponse.json(
        { ok: false, error: "Teléfono no válido. Introduce 9 dígitos (España, +34)." },
        { status: 400 },
      );
    }
    invitedPhoneStored = normalizedPhone;
  }

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
      invitedName: invitedName.trim(),
      invitedPhone: invitedPhoneStored,
      ...(normalizedRefCode ? { refCode: normalizedRefCode } : {}),
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
