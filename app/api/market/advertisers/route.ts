/**
 * GET /api/market/advertisers
 *
 * Lista publicantes (`MarketAdvertiser`) como oportunidades de captacion.
 *
 * Permisos: cualquier usuario autenticado (la lista es compartida por
 * decision de producto).
 *
 * Query params:
 *   - city? (filtra advertisers con al menos un listing en esa ciudad)
 *   - advertiserType? particular | agency
 *   - hasPhone? 1 (solo advertisers con telefono canonicalizado)
 *   - sinceHours? entero positivo (lastSeenAt en ventana)
 *   - cursor? base64 cursor para paginar
 *   - limit? maximo 50 (default 25)
 */

import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { listAdvertisers } from "@/lib/market/advertisers";

function asPositiveInt(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.floor(n);
}

const getHandler = async (request: Request) => {
  const session = await getSession();
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const sp = url.searchParams;

  const advertiserTypeParam = sp.get("advertiserType");
  const advertiserType =
    advertiserTypeParam === "particular" || advertiserTypeParam === "agency"
      ? advertiserTypeParam
      : undefined;

  const result = await listAdvertisers({
    city: sp.get("city") ?? undefined,
    advertiserType,
    hasPhone: sp.get("hasPhone") === "1" || sp.get("hasPhone") === "true",
    sinceHours: asPositiveInt(sp.get("sinceHours")),
    cursor: sp.get("cursor") ?? undefined,
    limit: asPositiveInt(sp.get("limit")),
  });

  return NextResponse.json({ ok: true, ...result });
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/market/advertisers" },
  getHandler,
);

export const dynamic = "force-dynamic";
