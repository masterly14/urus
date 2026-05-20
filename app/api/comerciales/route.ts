import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isAuthorized } from "@/lib/api/cron-auth";
import { withObservedRoute } from "@/lib/observability";

const COMERCIAL_SELECT = {
  id: true,
  nombre: true,
  ciudad: true,
  inmovillaAgentId: true,
} as const;

const getCachedComerciales = unstable_cache(
  () =>
    prisma.comercial.findMany({
      where: { activo: true },
      select: COMERCIAL_SELECT,
      orderBy: { nombre: "asc" },
    }),
  ["users-list"],
  { revalidate: 300, tags: ["users-list"] },
);

/**
 * GET /api/comerciales — Lista comerciales activos.
 *
 * Query params:
 *  - excludeId: omite el comercial con ese id de la lista (útil para el modal
 *    de selección de destino al eliminar un comercial). Cuando está presente,
 *    la respuesta NO usa caché para garantizar datos frescos.
 *
 * Respuesta: { comerciales: Array<{ id, nombre, ciudad, inmovillaAgentId }> }
 */
const getHandler = async (request: NextRequest) => {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const excludeId = new URL(request.url).searchParams.get("excludeId") ?? undefined;

  if (excludeId) {
    // Consulta directa sin caché cuando se filtra por exclusión.
    const comerciales = await prisma.comercial.findMany({
      where: { activo: true, id: { not: excludeId } },
      select: COMERCIAL_SELECT,
      orderBy: { nombre: "asc" },
    });
    return NextResponse.json({ comerciales });
  }

  const comerciales = await getCachedComerciales();
  return NextResponse.json({ comerciales });
};

export const GET = withObservedRoute({ method: "GET", route: "/api/comerciales" }, getHandler);
