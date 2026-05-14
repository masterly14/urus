import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getSession,
  unauthorized,
  forbidden,
  isCeoOrAdmin,
} from "@/lib/auth/session";

/**
 * DELETE /api/captacion/nota-encargo/[id]/delete
 *
 * Eliminación definitiva de una Nota de Encargo para reducir ruido visual.
 * Restricción: solo se permite borrar sesiones ya CANCELADAS.
 *
 * Seguridad:
 * - Comercial: solo puede borrar sus propias sesiones.
 * - CEO/Admin: puede borrar cualquier sesión.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return unauthorized();

  if (!isCeoOrAdmin(session.role) && !session.comercialId) {
    return forbidden();
  }

  const { id } = await params;
  if (!id || typeof id !== "string") {
    return NextResponse.json(
      { ok: false, error: "Id de sesión inválido" },
      { status: 400 },
    );
  }

  const nota = await prisma.notaEncargoSession.findUnique({
    where: { id },
    select: { id: true, state: true, comercialId: true },
  });

  if (!nota) {
    return NextResponse.json(
      { ok: false, error: "Nota de encargo no encontrada" },
      { status: 404 },
    );
  }

  if (!isCeoOrAdmin(session.role) && nota.comercialId !== session.comercialId) {
    return forbidden();
  }

  if (nota.state !== "CANCELADA") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Solo se pueden eliminar definitivamente notas en estado CANCELADA",
      },
      { status: 409 },
    );
  }

  await prisma.$transaction(async (tx) => {
    // Limpia referencias sueltas en proyecciones para evitar IDs huérfanos.
    await tx.propertyCurrent.updateMany({
      where: { notaEncargoSessionId: nota.id },
      data: { notaEncargoSessionId: null },
    });

    // Elimina jobs remanentes de esta sesión (si quedara alguno por retries).
    await tx.jobQueue.deleteMany({
      where: { payload: { path: ["sessionId"], equals: nota.id } },
    });

    // Limpia trazas de eventos específicas de la sesión para no mantener ruido
    // analítico si el usuario decidió purgar la nota.
    await tx.event.deleteMany({
      where: { payload: { path: ["sessionId"], equals: nota.id } },
    });

    await tx.notaEncargoSession.delete({
      where: { id: nota.id },
    });
  });

  return NextResponse.json({ ok: true, sessionId: nota.id }, { status: 200 });
}

