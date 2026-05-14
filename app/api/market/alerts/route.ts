/**
 * GET /api/market/alerts            (lista las alertas del usuario)
 * POST /api/market/alerts           (crea alerta)
 *
 * Permisos: cualquier usuario autenticado. Cada alerta esta scoped al
 * `userId` del owner.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, unauthorized } from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import {
  createAlert,
  listAlertsForUser,
  type AlertChannel,
  type AlertFrequency,
  type AlertFilters,
} from "@/lib/market/alerts";

const polygonSchema = z
  .array(
    z
      .tuple([z.number().finite(), z.number().finite()])
      .or(
        z.object({ lng: z.number().finite(), lat: z.number().finite() }),
      ),
  )
  .min(3)
  .max(500);

const filtersSchema = z.object({
  city: z.string().min(1).max(64).optional(),
  sources: z.array(z.enum(["source_a", "source_b", "source_c", "source_d"])).optional(),
  operation: z.enum(["sale", "rent"]).optional(),
  advertiserType: z.enum(["particular", "agency"]).optional(),
  hasPhone: z.boolean().optional(),
  priceMin: z.number().int().nonnegative().optional(),
  priceMax: z.number().int().positive().optional(),
  areaMin: z.number().int().nonnegative().optional(),
  areaMax: z.number().int().positive().optional(),
  roomsMin: z.number().int().nonnegative().optional(),
  polygon: polygonSchema.optional(),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  filters: filtersSchema,
  channels: z.array(z.enum(["in_app", "whatsapp"])).min(1),
  frequency: z.enum(["realtime", "hourly", "daily"]),
  active: z.boolean().optional(),
});

function normalizePolygon(input: unknown) {
  if (!Array.isArray(input)) return undefined;
  const out: [number, number][] = [];
  for (const point of input) {
    if (Array.isArray(point) && point.length === 2) {
      out.push([Number(point[0]), Number(point[1])]);
    } else if (point && typeof point === "object") {
      const p = point as Record<string, unknown>;
      const lng = Number(p.lng);
      const lat = Number(p.lat);
      if (Number.isFinite(lng) && Number.isFinite(lat)) out.push([lng, lat]);
    }
  }
  return out.length >= 3 ? out : undefined;
}

const getHandler = async () => {
  const session = await getSession();
  if (!session) return unauthorized();
  const items = await listAlertsForUser(session.userId);
  return NextResponse.json({ ok: true, items });
};

const postHandler = async (request: Request) => {
  const session = await getSession();
  if (!session) return unauthorized();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_JSON", message: "Body no es JSON" } },
      { status: 400 },
    );
  }
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "INVALID_PAYLOAD", message: parsed.error.message },
      },
      { status: 400 },
    );
  }

  const filters: AlertFilters = {
    ...parsed.data.filters,
    polygon: normalizePolygon(parsed.data.filters.polygon),
  };

  const created = await createAlert({
    userId: session.userId,
    name: parsed.data.name,
    filters,
    channels: parsed.data.channels as AlertChannel[],
    frequency: parsed.data.frequency as AlertFrequency,
    active: parsed.data.active,
  });
  return NextResponse.json({ ok: true, alert: created });
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/market/alerts" },
  getHandler,
);

export const POST = withObservedRoute(
  { method: "POST", route: "/api/market/alerts" },
  postHandler,
);

export const dynamic = "force-dynamic";
