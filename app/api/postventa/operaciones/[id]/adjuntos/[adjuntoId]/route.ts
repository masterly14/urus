import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { forbidden, getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { canDeleteAdjunto } from "@/lib/postventa/panel/access";
import { getCloudinary } from "@/lib/cloudinary/client";

type Params = { params: Promise<{ id: string; adjuntoId: string }> };

const deleteHandler = async (request: Request, { params }: Params) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  const { id: operacionId, adjuntoId } = await params;

  const existing = await prisma.operacionAdjunto.findFirst({
    where: { id: adjuntoId, operacionId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Adjunto no encontrado" }, { status: 404 });
  }
  if (!canDeleteAdjunto(session, existing)) return forbidden();

  // Borrar en Cloudinary. Si falla, continuamos igual — el registro DB es la
  // source of truth para la UI; el storage huérfano puede limpiarse luego.
  try {
    const cloudinary = getCloudinary();
    await cloudinary.uploader.destroy(existing.publicId, {
      resource_type: existing.resourceType,
      invalidate: true,
    });
  } catch (error) {
    console.error("[adjuntos/DELETE] cloudinary destroy fallo", {
      publicId: existing.publicId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  await prisma.operacionAdjunto.delete({ where: { id: adjuntoId } });
  return NextResponse.json({ ok: true });
};

export const DELETE = withObservedRoute(
  { method: "DELETE", route: "/api/postventa/operaciones/[id]/adjuntos/[adjuntoId]" },
  deleteHandler,
);
