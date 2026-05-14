/**
 * PATCH /api/market/listings/:id/captacion-stage
 *
 * Cambia manualmente el stage del pipeline de captacion desde el kanban
 * (`/platform/market/captacion/kanban`).
 *
 * Transiciones permitidas (manuales, sin disparar workflows externos):
 *   - Reabrir: FAILED -> NEW (limpia captacionFailureReason).
 *   - Descartar: cualquier -> FAILED (requiere `reason` no vacio).
 *   - Reordenar entre stages intermedios: PROSPECT_CREATED |
 *     ENCARGO_ATTACHED | READY_FOR_PROPERTY entre si.
 *
 * Transiciones que NO se permiten desde aqui:
 *   - NEW -> PROSPECT_CREATING / PROSPECT_CREATED: requieren llamar al
 *     endpoint POST /api/market/listings/:id/inmovilla-prospect (que crea
 *     prospecto en Inmovilla via worker). El kanban abre ese flujo en la UI
 *     en lugar de dejar al usuario forzar el estado.
 *   - PROSPECT_CREATED -> PROPERTY_CREATING / PROPERTY_CREATED: requieren
 *     POST /api/market/listings/:id/promote-property.
 *
 * Permisos: cualquier usuario autenticado.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, unauthorized } from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { prisma } from "@/lib/prisma";

const ALLOWED_INTERMEDIATE = new Set([
  "PROSPECT_CREATED",
  "ENCARGO_ATTACHED",
  "READY_FOR_PROPERTY",
]);

const bodySchema = z.object({
  stage: z.enum([
    "NEW",
    "PROSPECT_CREATED",
    "ENCARGO_ATTACHED",
    "READY_FOR_PROPERTY",
    "FAILED",
  ]),
  reason: z.string().trim().min(1).max(500).optional(),
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
        error: { code: "INVALID_PAYLOAD", message: parsed.error.message },
      },
      { status: 400 },
    );
  }

  const listing = await prisma.marketListing.findUnique({
    where: { id },
    select: {
      id: true,
      captacionStage: true,
      captacionFailureReason: true,
    },
  });
  if (!listing) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Listing no encontrado" } },
      { status: 404 },
    );
  }

  const { stage: nextStage, reason } = parsed.data;
  const currentStage = listing.captacionStage;

  if (currentStage === nextStage) {
    return NextResponse.json({
      ok: true,
      status: "UNCHANGED",
      stage: currentStage,
    });
  }

  // Validar transicion legal.
  const isReopen = currentStage === "FAILED" && nextStage === "NEW";
  const isFail = nextStage === "FAILED";
  const isIntermediate =
    ALLOWED_INTERMEDIATE.has(currentStage) &&
    ALLOWED_INTERMEDIATE.has(nextStage);

  if (!isReopen && !isFail && !isIntermediate) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "ILLEGAL_TRANSITION",
          message:
            `Transicion ${currentStage} -> ${nextStage} no permitida desde el kanban. ` +
            `Usa los endpoints de prospect/promote para avanzar el pipeline.`,
        },
      },
      { status: 422 },
    );
  }

  if (isFail && (!reason || reason.length === 0)) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "REASON_REQUIRED",
          message: "Mover a FAILED requiere indicar la razon.",
        },
      },
      { status: 422 },
    );
  }

  const updated = await prisma.marketListing.update({
    where: { id },
    data: {
      captacionStage: nextStage,
      captacionFailureReason: isReopen ? null : reason ?? listing.captacionFailureReason,
      captacionUpdatedAt: new Date(),
    },
    select: {
      captacionStage: true,
      captacionFailureReason: true,
      captacionUpdatedAt: true,
    },
  });

  return NextResponse.json({
    ok: true,
    status: "UPDATED",
    stage: updated.captacionStage,
    captacionFailureReason: updated.captacionFailureReason,
    captacionUpdatedAt: updated.captacionUpdatedAt.toISOString(),
  });
};

export const PATCH = withObservedRoute(
  { method: "PATCH", route: "/api/market/listings/[id]/captacion-stage" },
  patchHandler,
);

export const dynamic = "force-dynamic";
