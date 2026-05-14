/**
 * POST /api/market/listings/:id/inmovilla-prospect
 *
 * Crea (en caliente) un prospecto en Inmovilla a partir de un MarketListing.
 * No usa job queue; responde sincrónicamente con el resultado final.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, unauthorized } from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import {
  CaptacionServiceError,
  createProspectoFromListing,
} from "@/lib/market/captacion-services";

const bodySchema = z.object({
  keyLoca: z.number().int().positive().optional(),
  keyTipo: z.number().int().positive().optional(),
  keyZona: z.number().int().positive().nullable().optional(),
  keyAcci: z.number().int().positive().optional(),
  ref: z.string().trim().min(1).max(64).optional(),
  precioInmo: z.number().nonnegative().optional(),
  banyos: z.number().int().nonnegative().optional(),
  habitaciones: z.number().int().nonnegative().optional(),
  calle: z.string().trim().max(150).optional(),
  numero: z.number().int().nonnegative().optional(),
  planta: z.union([z.string(), z.number()]).optional(),
  fotos: z
    .record(
      z.string(),
      z.object({
        url: z.string().url(),
        posicion: z.number().int().positive().optional(),
      }),
    )
    .optional(),
});

function isCaptacionSyncEnabled(): boolean {
  return (
    process.env.MARKET_CAPTACION_SYNC_ENABLED === "true" ||
    process.env.MARKET_CAPTACION_SYNC_ENABLED === "1"
  );
}

const postHandler = async (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const session = await getSession();
  if (!session) return unauthorized();

  if (!isCaptacionSyncEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "FEATURE_DISABLED",
          message: "MARKET_CAPTACION_SYNC_ENABLED está desactivado.",
        },
      },
      { status: 503 },
    );
  }

  const { id } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    payload = {};
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

  try {
    const result = await createProspectoFromListing({
      listingId: id,
      actorUserId: session.userId,
      ...parsed.data,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof CaptacionServiceError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
          },
        },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : String(error),
        },
      },
      { status: 500 },
    );
  }
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/market/listings/[id]/inmovilla-prospect" },
  postHandler,
);

export const dynamic = "force-dynamic";
