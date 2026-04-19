import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import type { AsignacionEstado } from "@prisma/client";
import { withObservedRoute } from "@/lib/observability";


type Params = { params: Promise<{ asignacionId: string }> };

const VALID_ESTADOS: AsignacionEstado[] = [
  "PENDIENTE", "EN_PROGRESO", "COMPLETADA", "BLOQUEADA", "CANCELADA",
];

const PatchBodySchema = z.object({
  estado: z.string().optional(),
  notas: z.string().optional(),
});

/**
 * PATCH /api/colaboradores/asignaciones/:asignacionId — Actualizar estado/notas.
 */
const patchHandler = async (request: Request, { params }: Params) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  const { asignacionId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const parsed = PatchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Input inválido", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const data: Record<string, unknown> = {};

  if (parsed.data.estado !== undefined) {
    if (!VALID_ESTADOS.includes(parsed.data.estado as AsignacionEstado)) {
      return NextResponse.json({ error: `Estado inválido. Válidos: ${VALID_ESTADOS.join(", ")}` }, { status: 400 });
    }
    data.estado = parsed.data.estado;
    if (parsed.data.estado === "COMPLETADA") {
      data.completedAt = new Date();
    }
  }

  if (parsed.data.notas !== undefined) {
    data.notas = parsed.data.notas.trim();
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
const deleteHandler = async (request: Request, { params }: Params) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
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
