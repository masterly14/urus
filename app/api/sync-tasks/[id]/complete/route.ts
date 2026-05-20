import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { ManualSyncTaskStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

type SessionRole = "ceo" | "admin" | "comercial";

function normalizeRole(role: string | null | undefined): SessionRole | null {
  if (role === "ceo" || role === "admin" || role === "comercial") return role;
  return null;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
  }

  const role = normalizeRole(session.user.role);
  if (!role) {
    return NextResponse.json({ ok: false, error: "Rol inválido" }, { status: 403 });
  }

  const actor = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, comercialId: true },
  });
  if (!actor) {
    return NextResponse.json({ ok: false, error: "Usuario no encontrado" }, { status: 404 });
  }

  const { id } = await params;
  if (!id?.trim()) {
    return NextResponse.json({ ok: false, error: "id inválido" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { confirm?: boolean; note?: string } | null;
  if (!body?.confirm) {
    return NextResponse.json({ ok: false, error: "Debes confirmar explícitamente" }, { status: 400 });
  }

  const task = await prisma.manualSyncTask.findUnique({
    where: { id },
    select: { id: true, targetComercialId: true },
  });
  if (!task) {
    return NextResponse.json({ ok: false, error: "Tarea no encontrada" }, { status: 404 });
  }

  if (role === "comercial" && actor.comercialId !== task.targetComercialId) {
    return NextResponse.json({ ok: false, error: "Sin permisos para esta tarea" }, { status: 403 });
  }

  const updated = await prisma.manualSyncTask.update({
    where: { id },
    data: {
      status: ManualSyncTaskStatus.DONE,
      doneAt: new Date(),
      doneByUserId: actor.id,
      note: body.note?.trim() ?? "",
    },
  });

  return NextResponse.json({ ok: true, task: updated });
}
