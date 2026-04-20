/**
 * GET /api/matching/rematch/demands?q=<query>
 *
 * Busca demandas activas por nombre o referencia para el autocomplete del RematchPanel.
 * Solo CEO.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withObservedRoute } from "@/lib/observability";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { ACTIVE_DEMAND_STATES } from "@/lib/matching";

const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (session.role !== "ceo") {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";

  if (q.length < 2) {
    return NextResponse.json({ demands: [] });
  }

  const demands = await prisma.demandCurrent.findMany({
    where: {
      estadoId: { in: ACTIVE_DEMAND_STATES },
      OR: [
        { nombre: { contains: q, mode: "insensitive" } },
        { ref: { contains: q, mode: "insensitive" } },
        { codigo: { contains: q, mode: "insensitive" } },
      ],
    },
    select: {
      codigo: true,
      ref: true,
      nombre: true,
    },
    take: 20,
    orderBy: { nombre: "asc" },
  });

  return NextResponse.json({ demands });
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/matching/rematch/demands" },
  getHandler,
);
