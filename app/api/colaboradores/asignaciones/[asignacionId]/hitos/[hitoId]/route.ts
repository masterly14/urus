import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { HitoEstado } from "@/app/generated/prisma/client";

type Params = { params: Promise<{ asignacionId: string; hitoId: string }> };

const VALID_ESTADOS: HitoEstado[] = [
  "PENDIENTE", "EN_PROGRESO", "COMPLETADO", "BLOQUEADO", "CANCELADO",
];

/**
 * PATCH /api/colaboradores/asignaciones/:asignacionId/hitos/:hitoId
 * Actualizar estado del hito. Calcula timestamps automaticamente:
 * - EN_PROGRESO → iniciadoAt = now, slaVenceAt = now + slaDias
 * - COMPLETADO → completadoAt = now
 */
export async function PATCH(request: Request, { params }: Params) {
  const { hitoId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};

  if (typeof body.estado === "string") {
    if (!VALID_ESTADOS.includes(body.estado as HitoEstado)) {
      return NextResponse.json(
        { error: `Estado inválido. Válidos: ${VALID_ESTADOS.join(", ")}` },
        { status: 400 },
      );
    }

    const newEstado = body.estado as HitoEstado;
    data.estado = newEstado;

    const current = await prisma.colaboradorHito.findUnique({
      where: { id: hitoId },
      select: { iniciadoAt: true, slaDias: true },
    });

    if (!current) {
      return NextResponse.json({ error: "Hito no encontrado" }, { status: 404 });
    }

    const now = new Date();

    if (newEstado === "EN_PROGRESO" && !current.iniciadoAt) {
      data.iniciadoAt = now;
      if (current.slaDias) {
        data.slaVenceAt = new Date(now.getTime() + current.slaDias * 24 * 60 * 60 * 1000);
      }
    }

    if (newEstado === "COMPLETADO") {
      data.completadoAt = now;
    }
  }

  if (typeof body.notas === "string") {
    data.notas = body.notas.trim();
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  try {
    const hito = await prisma.colaboradorHito.update({
      where: { id: hitoId },
      data,
    });

    return NextResponse.json({ ok: true, hito });
  } catch (error) {
    console.error("[api/hitos/:id] PATCH error:", error);
    return NextResponse.json({ error: "Error al actualizar hito" }, { status: 500 });
  }
}
