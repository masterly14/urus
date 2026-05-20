/**
 * GET /api/market/listings/:id/reverse-geocode
 *
 * Convierte el par (lat, lng) almacenado del listing en una dirección postal
 * estructurada usando Google Geocoding API (server-side). Cacheado en kv_store
 * por listingId.
 *
 * - Si el listing no existe → 404.
 * - Si el listing no tiene lat/lng → 200 { ok: true, result: null, reason: "NO_COORDS" }.
 * - Si no hay GOOGLE_MAPS_API_KEY (ni fallback) → 200 { ok: true, result: null, reason: "NO_API_KEY" }.
 *
 * Permisos: cualquier usuario autenticado.
 *
 * Query params:
 *   - force=1 → ignora cache y vuelve a llamar a Google.
 */

import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { prisma } from "@/lib/prisma";
import { reverseGeocodeListing } from "@/lib/market/reverse-geocoding";

const getHandler = async (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const session = await getSession();
  if (!session) return unauthorized();

  const { id } = await context.params;
  const url = new URL(request.url);
  const force = ["1", "true", "yes"].includes(
    (url.searchParams.get("force") ?? "").toLowerCase(),
  );

  const listing = await prisma.marketListing.findUnique({
    where: { id },
    select: { id: true, lat: true, lng: true },
  });

  if (!listing) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "NOT_FOUND", message: "MarketListing no encontrado" },
      },
      { status: 404 },
    );
  }

  if (listing.lat == null || listing.lng == null) {
    return NextResponse.json({
      ok: true,
      result: null,
      reason: "NO_COORDS",
    });
  }

  try {
    const result = await reverseGeocodeListing(
      listing.id,
      listing.lat,
      listing.lng,
      { force },
    );

    if (result == null) {
      return NextResponse.json({
        ok: true,
        result: null,
        reason: "NO_API_KEY",
      });
    }

    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        ok: false,
        error: { code: "GEOCODING_FAILED", message },
      },
      { status: 502 },
    );
  }
};

export const GET = withObservedRoute(
  {
    method: "GET",
    route: "/api/market/listings/[id]/reverse-geocode",
  },
  getHandler,
);

export const dynamic = "force-dynamic";
