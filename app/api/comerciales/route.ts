import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorized } from "@/lib/api/cron-auth";
import { withObservedRoute } from "@/lib/observability";


/**
 * GET /api/comerciales — Lista comerciales activos (para selects de admin).
 */
const getHandler = async (request: Request) => {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const comerciales = await prisma.comercial.findMany({
    where: { activo: true },
    select: { id: true, nombre: true, ciudad: true },
    orderBy: { nombre: "asc" },
  });

  return NextResponse.json({ comerciales });
}

export const GET = withObservedRoute({ method: "GET", route: "/api/comerciales" }, getHandler);
