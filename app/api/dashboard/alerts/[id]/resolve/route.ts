import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSessionFromRequest, isCeoOrAdmin, unauthorized, forbidden } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { withObservedRoute } from "@/lib/observability";


/**
 * PATCH /api/dashboard/alerts/:id/resolve
 *
 * Marca una alerta como resuelta.
 */
const patchHandler = async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

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

    revalidateTag("platform-summary", { expire: 0 });

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

export const PATCH = withObservedRoute({ method: "PATCH", route: "/api/dashboard/alerts/[id]/resolve" }, patchHandler);
