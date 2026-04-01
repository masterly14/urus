import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * PATCH /api/dashboard/alerts/:id/resolve
 *
 * Marca una alerta como resuelta.
 */
export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const existing = await prisma.dashboardAlert.findUnique({
      where: { id },
      select: { id: true, resolvedAt: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Alerta no encontrada" }, { status: 404 });
    }

    if (existing.resolvedAt) {
      return NextResponse.json({ ok: true, alreadyResolved: true });
    }

    const updated = await prisma.dashboardAlert.update({
      where: { id },
      data: { resolvedAt: new Date() },
    });

    return NextResponse.json({ ok: true, alert: updated });
  } catch (err) {
    console.error(
      "[api/dashboard/alerts/resolve] Error:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "Error al resolver alerta" },
      { status: 500 },
    );
  }
}
