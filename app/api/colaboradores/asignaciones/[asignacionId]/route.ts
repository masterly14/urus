import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { AsignacionEstado } from "@/app/generated/prisma/client";
import { withObservedRoute } from "@/lib/observability";


type Params = { params: Promise<{ asignacionId: string }> };

const VALID_ESTADOS: AsignacionEstado[] = [
  "PENDIENTE", "EN_PROGRESO", "COMPLETADA", "BLOQUEADA", "CANCELADA",
];

/**
 * PATCH /api/colaboradores/asignaciones/:asignacionId — Actualizar estado/notas.
 */
const patchHandler = async (request: Request, { params }: Params) => {
  const { asignacionId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};

  if (typeof body.estado === "string") {
    if (!VALID_ESTADOS.includes(body.estado as AsignacionEstado)) {
      return NextResponse.json({ error: `Estado inválido. Válidos: ${VALID_ESTADOS.join(", ")}` }, { status: 400 });
    }
    data.estado = body.estado;
    if (body.estado === "COMPLETADA") {
      data.completedAt = new Date();
    }
  }

  if (typeof body.notas === "string") {
    data.notas = body.notas.trim();
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  try {
    const asignacion = await prisma.colaboradorAsignacion.update({
      where: { id: asignacionId },
      data,
      include: { hitos: { orderBy: { orden: "asc" } } },
    });

    return NextResponse.json({ ok: true, asignacion });
  } catch (error) {
    console.error("[api/asignaciones/:id] PATCH error:", error);
    return NextResponse.json({ error: "Error al actualizar asignación" }, { status: 500 });
  }
}

export const PATCH = withObservedRoute({ method: "PATCH", route: "/api/colaboradores/asignaciones/[asignacionId]" }, patchHandler);

/**
 * DELETE /api/colaboradores/asignaciones/:asignacionId — Cancelar asignacion.
 */
const deleteHandler = async (_request: Request, { params }: Params) => {
  const { asignacionId } = await params;

  try {
    await prisma.colaboradorAsignacion.update({
      where: { id: asignacionId },
      data: { estado: "CANCELADA" },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/asignaciones/:id] DELETE error:", error);
    return NextResponse.json({ error: "Error al cancelar asignación" }, { status: 500 });
  }
}

export const DELETE = withObservedRoute({ method: "DELETE", route: "/api/colaboradores/asignaciones/[asignacionId]" }, deleteHandler);
