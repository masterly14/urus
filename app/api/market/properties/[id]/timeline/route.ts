/**
 * GET /api/market/properties/:id/timeline
 *
 * Devuelve hasta 100 entradas combinadas (versions + events) de TODOS los
 * listings que pertenecen al cluster, ordenadas por `occurredAt` desc.
 *
 * Util para la ficha de propiedad (`/platform/market/properties/[id]`):
 * permite mostrar una sola linea cronologica con alta, baja temporal,
 * rebaja (con delta), reaparicion y eventos de mercado, sin importar en
 * que portal ocurrio el cambio.
 *
 * Acepta `id` real o `virtual:<listingId>` igual que el endpoint base.
 *
 * Permisos: cualquier usuario autenticado.
 */

import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { getPropertyClusterTimeline } from "@/lib/market/properties";

const getHandler = async (
  _request: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const session = await getSession();
  if (!session) return unauthorized();

  const { id } = await context.params;
  const entries = await getPropertyClusterTimeline(id, 100);
  return NextResponse.json({ ok: true, propertyId: id, entries });
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/market/properties/[id]/timeline" },
  getHandler,
);

export const dynamic = "force-dynamic";
