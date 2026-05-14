/**
 * PATCH /api/market/listings/:id/assignment
 *
 * Asigna, reasigna o desasigna un comercial a una oportunidad específica
 * (`MarketListing`).
 *
 * Permisos: cualquier usuario autenticado.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, unauthorized } from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  comercialId: z.string().trim().min(1).nullable(),
});

const patchHandler = async (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const session = await getSession();
  if (!session) return unauthorized();

  const { id } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_JSON", message: "Body no es JSON" } },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INVALID_PAYLOAD",
          message: parsed.error.message,
        },
      },
      { status: 400 },
    );
  }

  const listing = await prisma.marketListing.findUnique({
    where: { id },
    select: {
      id: true,
      assignedComercialId: true,
      assignedAt: true,
      assignedByUserId: true,
      assignedComercial: { select: { id: true, nombre: true } },
    },
  });

  if (!listing) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "MarketListing no encontrado" } },
      { status: 404 },
    );
  }

  const { comercialId } = parsed.data;

  if (comercialId === listing.assignedComercialId) {
    return NextResponse.json({
      ok: true,
      status: "UNCHANGED" as const,
      assignment: {
        comercialId: listing.assignedComercialId,
        comercialNombre: listing.assignedComercial?.nombre ?? null,
        assignedAt: listing.assignedAt ? listing.assignedAt.toISOString() : null,
        assignedByUserId: listing.assignedByUserId,
      },
    });
  }

  if (comercialId !== null) {
    const registered = await prisma.user.findFirst({
      where: {
        role: "comercial",
        comercialId,
        comercial: { is: { activo: true } },
      },
      select: {
        id: true,
        comercial: {
          select: {
            id: true,
            nombre: true,
          },
        },
      },
    });

    if (!registered?.comercial) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "INVALID_COMERCIAL",
            message: "Comercial no registrado en plataforma o inactivo",
          },
        },
        { status: 422 },
      );
    }
  }

  const updated = await prisma.marketListing.update({
    where: { id },
    data:
      comercialId === null
        ? {
            assignedComercialId: null,
            assignedAt: null,
            assignedByUserId: null,
          }
        : {
            assignedComercialId: comercialId,
            assignedAt: new Date(),
            assignedByUserId: session.userId,
          },
    select: {
      assignedComercialId: true,
      assignedAt: true,
      assignedByUserId: true,
      assignedComercial: { select: { id: true, nombre: true } },
    },
  });

  return NextResponse.json({
    ok: true,
    status: comercialId === null ? ("UNASSIGNED" as const) : ("ASSIGNED" as const),
    assignment: {
      comercialId: updated.assignedComercialId,
      comercialNombre: updated.assignedComercial?.nombre ?? null,
      assignedAt: updated.assignedAt ? updated.assignedAt.toISOString() : null,
      assignedByUserId: updated.assignedByUserId,
    },
  });
};

export const PATCH = withObservedRoute(
  { method: "PATCH", route: "/api/market/listings/[id]/assignment" },
  patchHandler,
);

export const dynamic = "force-dynamic";
