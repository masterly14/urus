/**
 * GET /api/market/properties/:id
 *
 * Devuelve un cluster `MarketProperty` completo (cross-portal) con todos sus
 * listings agrupados, galeria deduplicada y rollups (precio min/max, spread,
 * captacion, advertiser).
 *
 * Acepta dos formatos de id:
 *   - `<cuid>`            -> MarketProperty real.
 *   - `virtual:<cuid>`    -> Listing huerfano (sin propertyId asignado todavia).
 *     Devuelve el cluster con un solo portal para que la UI pueda renderizar
 *     la ficha aunque el pipeline de identidad no haya clusterizado aun.
 *
 * Permisos: cualquier usuario autenticado (esta es la vista que ve el
 * comercial; ya pasa por la fila de oportunidades a la que tiene acceso).
 */

import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { getPropertyCluster } from "@/lib/market/properties";

const getHandler = async (
  _request: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const session = await getSession();
  if (!session) return unauthorized();

  const { id } = await context.params;
  const cluster = await getPropertyCluster(id);
  if (!cluster) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Propiedad no encontrada" } },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, property: cluster });
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/market/properties/[id]" },
  getHandler,
);

export const dynamic = "force-dynamic";
