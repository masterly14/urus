import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { syncComercialAssignments } from "@/lib/routing/sync-comercial-assignments";
const PostBodySchema = z.object({
  token: z.string(),
  password: z.string().min(8),
});

function isStoredSpainE164(digits: string): boolean {
  return digits.length === 11 && digits.startsWith("34");
}

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

  const { token, password } = parsed.data;

  const invitation = await prisma.invitation.findUnique({ where: { token } });

  if (!invitation || invitation.used || invitation.expiresAt < new Date()) {
    return NextResponse.json(
      { ok: false, error: "Invitación inválida o expirada" },
      { status: 400 }
    );
  }

  // Atomic claim: mark token as used only if still unused.
  // If another request races us, updateMany returns count=0.
  const claimed = await prisma.invitation.updateMany({
    where: { id: invitation.id, used: false },
    data: { used: true },
  });
  if (claimed.count === 0) {
    return NextResponse.json(
      { ok: false, error: "Invitación ya utilizada" },
      { status: 409 }
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

  const name = invitation.invitedName.trim();
  if (!name) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Esta invitación no incluye nombre. Pide al administrador que envíe una invitación nueva.",
      },
      { status: 400 },
    );
  }

  let phoneDigits: string | null = null;
  if (invitation.role === "comercial") {
    const stored = invitation.invitedPhone.trim();
    if (!stored || !isStoredSpainE164(stored)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Esta invitación no incluye un teléfono válido. Pide al administrador que envíe una invitación nueva.",
        },
        { status: 400 },
      );
    }
    phoneDigits = stored;
  }

  const signUpResult = await auth.api.signUpEmail({
    body: {
      email: invitation.email,
      password,
      name,
    },
  });

  if (!signUpResult?.user) {
    // Rollback: un-claim the invitation so it can be retried
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { used: false },
    });
    return NextResponse.json(
      { ok: false, error: "Error al crear el usuario" },
      { status: 500 }
    );
  }

  const userId = signUpResult.user.id;
  let comercialId: string | null = null;

  // H3 completado: envolver provisioning post-signUp en transacción.
  // signUp queda fuera (Better Auth gestiona su propia tx), pero el tramo
  // Comercial + user.update es atómico: si cualquier paso falla, nada queda
  // a medio aplicar (invitation used=true + user sin rol/comercial).
  try {
    comercialId = await prisma.$transaction(async (tx) => {
      let cId: string | null = null;

      if (invitation.role === "comercial" && phoneDigits) {
        const byEmail = await tx.comercial.findFirst({
          where: {
            email: { equals: invitation.email.trim(), mode: "insensitive" },
            activo: true,
            user: { is: null },
          },
          select: { id: true, ciudad: true, inmovillaRefCode: true },
        });

        if (byEmail) {
          cId = byEmail.id;
          await tx.comercial.update({
            where: { id: cId },
            data: {
              nombre: name,
              telefono: phoneDigits,
              waId: phoneDigits,
              ...(!byEmail.ciudad?.trim() ? { ciudad: "Córdoba" } : {}),
              ...(invitation.refCode && !byEmail.inmovillaRefCode
                ? { inmovillaRefCode: invitation.refCode }
                : {}),
            },
          });
        } else {
          const newComercial = await tx.comercial.create({
            data: {
              nombre: name,
              email: invitation.email,
              telefono: phoneDigits,
              waId: phoneDigits,
              ciudad: "Córdoba",
              especialidad: "general",
              activo: true,
              inmovillaRefCode: invitation.refCode ?? null,
            },
          });
          cId = newComercial.id;
        }
      }

      await tx.user.update({
        where: { id: userId },
        data: {
          role: invitation.role,
          emailVerified: true,
          ...(cId ? { comercialId: cId } : {}),
        },
      });

      return cId;
    });
  } catch (txErr) {
    console.error(
      `[invitations/accept] Transacción post-signUp falló para userId=${userId}: ${txErr instanceof Error ? txErr.message : txErr}`,
    );
    return NextResponse.json(
      { ok: false, error: "Error al configurar la cuenta. Contacta al administrador." },
      { status: 500 },
    );
  }

  // Sync existing unassigned properties/demands to this comercial.
  // Best-effort: failures here must not break the registration flow.
  let syncResult: { propertiesAssigned: number; demandsAssigned: number } | null = null;
  if (comercialId && invitation.role === "comercial") {
    try {
      const comercial = await prisma.comercial.findUnique({
        where: { id: comercialId },
        select: { id: true, nombre: true, inmovillaAgentId: true, inmovillaRefCode: true },
      });
      if (comercial) {
        syncResult = await syncComercialAssignments(comercial);
      }
    } catch (syncErr) {
      console.error(
        `[invitations/accept] Sync de asignaciones falló para comercialId=${comercialId}: ${syncErr instanceof Error ? syncErr.message : syncErr}`,
      );
    }
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: userId,
      email: signUpResult.user.email,
      name: signUpResult.user.name,
      role: invitation.role,
      comercialId,
    },
    ...(syncResult ? { sync: syncResult } : {}),
  });
}
