/**
 * GET /api/market/listings/:id/nota-encargo-prefill
 *
 * Devuelve datos mínimos para facilitar crear una nota de encargo desde
 * una oportunidad/listing de captación.
 *
 * Permisos: cualquier usuario autenticado.
 */

import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { prisma } from "@/lib/prisma";

const getHandler = async (
  _request: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const session = await getSession();
  if (!session) return unauthorized();

  const { id } = await context.params;
  const listing = await prisma.marketListing.findUnique({
    where: { id },
    select: {
      id: true,
      cadastralRef: true,
      phones: true,
      assignedComercialId: true,
      advertiser: {
        select: {
          phoneCanonical: true,
        },
      },
    },
  });

  if (!listing) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "MarketListing no encontrado" } },
      { status: 404 },
    );
  }

  const phone =
    listing.advertiser?.phoneCanonical ??
    listing.phones.find((p) => typeof p === "string" && p.trim().length > 0) ??
    null;

  return NextResponse.json({
    ok: true,
    prefill: {
      listingId: listing.id,
      refCatastral: listing.cadastralRef ?? null,
      propietarioPhone: phone,
      assignedComercialId: listing.assignedComercialId ?? null,
    },
  });
};

export const GET = withObservedRoute(
  {
    method: "GET",
    route: "/api/market/listings/[id]/nota-encargo-prefill",
  },
  getHandler,
);

export const dynamic = "force-dynamic";
