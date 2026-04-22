import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withObservedRoute } from "@/lib/observability";
import { getSessionFromRequest, unauthorized, isCeoOrAdmin } from "@/lib/auth/session";

/**
 * GET /api/operaciones/buscar-demandas?q=<query>
 *
 * Busca demandas activas por nombre, referencia o código para el
 * autocomplete del DemandSelector en la UI de operaciones.
 * Accesible por cualquier usuario autenticado (filtra por comercialId si no es CEO).
 */
const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";

  const where: Record<string, unknown> = {
    leadStatus: { notIn: ["CERRADO", "PERDIDO"] },
  };

  if (q.length >= 2) {
    where.OR = [
      { nombre: { contains: q, mode: "insensitive" } },
      { ref: { contains: q, mode: "insensitive" } },
      { codigo: { contains: q, mode: "insensitive" } },
    ];
  }

  if (!isCeoOrAdmin(session.role) && session.comercialId) {
    where.comercialId = session.comercialId;
  }

  const demands = await prisma.demandCurrent.findMany({
    where,
    select: {
      codigo: true,
      ref: true,
      nombre: true,
      telefono: true,
      leadStatus: true,
      zonas: true,
      tipos: true,
      presupuestoMin: true,
      presupuestoMax: true,
    },
    orderBy: { updatedAt: "desc" },
    take: q.length >= 2 ? 50 : 200,
  });

  return NextResponse.json({ demands });
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/operaciones/buscar-demandas" },
  getHandler,
);
