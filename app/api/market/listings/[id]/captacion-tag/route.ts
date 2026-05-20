/**
 * PATCH /api/market/listings/:id/captacion-tag
 *
 * Asigna o limpia la etiqueta comercial de captacion usada en Statefox:
 * CONTACTADO, EN_ESPERA, RECHAZADO, CAPTADO.
 *
 * Persistencia: kv_store (key por listing) para evitar migraciones del schema.
 * Permisos: cualquier usuario autenticado.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, unauthorized } from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { prisma } from "@/lib/prisma";
import {
  CAPTACION_TAG_VALUES,
  setCaptacionTagForListing,
} from "@/lib/market/captacion-tags";

const bodySchema = z.object({
  tag: z.enum(CAPTACION_TAG_VALUES).nullable(),
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
    select: { id: true },
  });

  if (!listing) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "MarketListing no encontrado" } },
      { status: 404 },
    );
  }

  const { tag } = parsed.data;
  await setCaptacionTagForListing(id, tag);

  return NextResponse.json({
    ok: true,
    status: tag ? ("TAG_ASSIGNED" as const) : ("TAG_CLEARED" as const),
    tag,
  });
};

export const PATCH = withObservedRoute(
  { method: "PATCH", route: "/api/market/listings/[id]/captacion-tag" },
  patchHandler,
);

export const dynamic = "force-dynamic";
