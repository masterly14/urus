/**
 * GET /api/comerciales/auto-validate-list
 *
 * Lista todos los comerciales activos con su estado de auto-validación.
 * Solo accesible por CEO/Admin.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getSessionFromRequest,
  isCeoOrAdmin,
  unauthorized,
  forbidden,
} from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";

const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

  const comerciales = await prisma.comercial.findMany({
    where: { activo: true },
    select: {
      id: true,
      nombre: true,
      autoValidateMicrosite: true,
    },
    orderBy: { nombre: "asc" },
  });

  return NextResponse.json({
    comerciales: comerciales.map((c) => ({
      comercialId: c.id,
      nombre: c.nombre,
      autoValidateMicrosite: c.autoValidateMicrosite,
    })),
  });
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/comerciales/auto-validate-list" },
  getHandler,
);
