/**
 * PATCH /api/market/alerts/:id   (editar / activar / pausar)
 * DELETE /api/market/alerts/:id  (borrar)
 *
 * Solo el owner puede modificar.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, unauthorized } from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import {
  deleteAlert,
  updateAlert,
  type AlertChannel,
  type AlertFilters,
  type AlertFrequency,
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
  sources: z
    .array(z.enum(["source_a", "source_b", "source_c", "source_d"]))
    .optional(),
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

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    filters: filtersSchema.optional(),
    channels: z.array(z.enum(["in_app", "whatsapp"])).min(1).optional(),
    frequency: z.enum(["realtime", "hourly", "daily"]).optional(),
    active: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Debe especificar al menos un campo a actualizar",
  });

function normalizePolygon(input: unknown): [number, number][] | undefined {
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
  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "INVALID_PAYLOAD", message: parsed.error.message },
      },
      { status: 400 },
    );
  }

  const { filters: rawFilters, channels, frequency, ...rest } = parsed.data;
  const updated = await updateAlert(id, session.userId, {
    ...rest,
    ...(channels ? { channels: channels as AlertChannel[] } : {}),
    ...(frequency ? { frequency: frequency as AlertFrequency } : {}),
    ...(rawFilters
      ? {
          filters: {
            ...rawFilters,
            polygon: normalizePolygon(rawFilters.polygon),
          } as AlertFilters,
        }
      : {}),
  });
  if (!updated) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Alerta no encontrada" } },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, alert: updated });
};

const deleteHandler = async (
  _request: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const session = await getSession();
  if (!session) return unauthorized();
  const { id } = await context.params;
  const ok = await deleteAlert(id, session.userId);
  if (!ok) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Alerta no encontrada" } },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true });
};

export const PATCH = withObservedRoute(
  { method: "PATCH", route: "/api/market/alerts/[id]" },
  patchHandler,
);

export const DELETE = withObservedRoute(
  { method: "DELETE", route: "/api/market/alerts/[id]" },
  deleteHandler,
);

export const dynamic = "force-dynamic";
