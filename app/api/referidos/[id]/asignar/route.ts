import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store";
import { isAuthorized } from "@/lib/api/cron-auth";

/**
 * PATCH /api/referidos/[id]/asignar — Asignar un comercial a un referido.
 * Requiere auth.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resolvedParams = await Promise.resolve(params);
  const referralId = resolvedParams.id;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const comercialId = typeof body.comercialId === "string" ? body.comercialId.trim() : "";
  if (!comercialId) {
    return NextResponse.json(
      { error: "Campo obligatorio: comercialId" },
      { status: 400 },
    );
  }

  const referral = await prisma.referral.findUnique({
    where: { id: referralId },
  });
  if (!referral) {
    return NextResponse.json({ error: "Referido no encontrado" }, { status: 404 });
  }

  const comercial = await prisma.comercial.findFirst({
    where: { id: comercialId, activo: true },
    select: { id: true, nombre: true },
  });
  if (!comercial) {
    return NextResponse.json(
      { error: "Comercial no encontrado o inactivo" },
      { status: 404 },
    );
  }

  await prisma.referral.update({
    where: { id: referralId },
    data: {
      comercialId: comercial.id,
      assignedAt: new Date(),
      status: "ASIGNADO",
    },
  });

  await appendEvent({
    type: "REFERIDO_ASIGNADO",
    aggregateType: "OPERACION",
    aggregateId: referral.propertyCode,
    payload: {
      referralId: referral.id,
      comercialId: comercial.id,
      comercialNombre: comercial.nombre,
      referredName: referral.referredName,
      referredPhone: referral.referredPhone,
    },
  });

  return NextResponse.json({ ok: true });
}
