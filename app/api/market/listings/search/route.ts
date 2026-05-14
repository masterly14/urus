/**
 * GET /api/market/listings/search
 *
 * Busqueda paginada de MarketListing con filtros del Core. Devuelve cursor
 * base64 para paginar.
 *
 * Query params:
 *   - city (required)
 *   - housingType, operation, source, status
 *   - priceMin, priceMax, metersMin, metersMax, roomsMin
 *   - zone
 *   - cursor, limit (max 100)
 */

import { NextResponse } from "next/server";
import {
  forbidden,
  getSession,
  isCeoOrAdmin,
  unauthorized,
} from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { searchListings } from "@/lib/market/api";
import {
  MARKET_HOUSING_TYPES,
  MARKET_LISTING_STATUSES,
  MARKET_OPERATIONS,
  MARKET_SOURCES,
  type MarketHousingType,
  type MarketListingStatus,
  type MarketOperation,
  type MarketSource,
} from "@/lib/market/types";

function asEnum<T extends string>(
  value: string | null,
  allowed: readonly T[],
): T | undefined {
  if (!value) return undefined;
  return (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

function asNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

const getHandler = async (request: Request) => {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

  const url = new URL(request.url);
  const sp = url.searchParams;
  const city = sp.get("city");
  if (!city) {
    return NextResponse.json({ ok: false, error: "city es requerido" }, { status: 400 });
  }

  const result = await searchListings({
    city,
    housingType: asEnum<MarketHousingType>(sp.get("housingType"), MARKET_HOUSING_TYPES),
    operation: asEnum<MarketOperation>(sp.get("operation"), MARKET_OPERATIONS),
    source: asEnum<MarketSource>(sp.get("source"), MARKET_SOURCES),
    status: asEnum<MarketListingStatus>(sp.get("status"), MARKET_LISTING_STATUSES),
    priceMin: asNumber(sp.get("priceMin")),
    priceMax: asNumber(sp.get("priceMax")),
    metersMin: asNumber(sp.get("metersMin")),
    metersMax: asNumber(sp.get("metersMax")),
    roomsMin: asNumber(sp.get("roomsMin")),
    zone: sp.get("zone") ?? undefined,
    cursor: sp.get("cursor") ?? undefined,
    limit: asNumber(sp.get("limit")),
  });

  return NextResponse.json({ ok: true, ...result });
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/market/listings/search" },
  getHandler,
);

export const dynamic = "force-dynamic";
