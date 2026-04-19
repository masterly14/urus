/**
 * GET/PUT /api/comerciales/[comercialId]/auto-validate-toggle
 *
 * Lee o actualiza el flag `autoValidateMicrosite` de un comercial.
 * Solo accesible por CEO/Admin.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  getSessionFromRequest,
  isCeoOrAdmin,
  unauthorized,
  forbidden,
} from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";

type RouteContext = { params: Promise<{ comercialId: string }> };

const getHandler = async (request: Request, context: RouteContext) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

  const { comercialId } = await context.params;

  const comercial = await prisma.comercial.findUnique({
    where: { id: comercialId },
    select: { id: true, nombre: true, autoValidateMicrosite: true },
  });

  if (!comercial) {
    return NextResponse.json({ error: "Comercial no encontrado" }, { status: 404 });
  }

  return NextResponse.json({
    comercialId: comercial.id,
    nombre: comercial.nombre,
    autoValidateMicrosite: comercial.autoValidateMicrosite,
  });
};

const bodySchema = z.object({
  autoValidateMicrosite: z.boolean(),
});

const putHandler = async (request: Request, context: RouteContext) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

  const { comercialId } = await context.params;

  const rawBody = await request.json();
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Body inválido", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const comercial = await prisma.comercial.findUnique({
    where: { id: comercialId },
    select: { id: true },
  });

  if (!comercial) {
    return NextResponse.json({ error: "Comercial no encontrado" }, { status: 404 });
  }

  const updated = await prisma.comercial.update({
    where: { id: comercialId },
    data: { autoValidateMicrosite: parsed.data.autoValidateMicrosite },
    select: { id: true, nombre: true, autoValidateMicrosite: true },
  });

  return NextResponse.json({
    comercialId: updated.id,
    nombre: updated.nombre,
    autoValidateMicrosite: updated.autoValidateMicrosite,
  });
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/comerciales/[comercialId]/auto-validate-toggle" },
  getHandler,
);

export const PUT = withObservedRoute(
  { method: "PUT", route: "/api/comerciales/[comercialId]/auto-validate-toggle" },
  putHandler,
);
