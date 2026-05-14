/**
 * POST /api/market/advertisers/:id/inmovilla-contact
 *
 * Encola un job `MARKET_PUSH_ADVERTISER_TO_INMOVILLA` para crear (o
 * vincular) el publicante en Inmovilla. Si el `MarketAdvertiser` ya
 * tiene `inmovillaContactId`, no encola y devuelve `ALREADY_LINKED`.
 *
 * Idempotencia: la idempotency key del job es estable por advertiser
 * (`market:advertiser:inmovilla:${id}`), de manera que llamadas
 * concurrentes mientras el job esta en cola devuelven el mismo registro.
 *
 * Permisos: cualquier usuario autenticado.
 */

import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { prisma } from "@/lib/prisma";
import { enqueueJob } from "@/lib/job-queue";

const postHandler = async (
  _request: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const session = await getSession();
  if (!session) return unauthorized();

  const { id } = await context.params;

  const advertiser = await prisma.marketAdvertiser.findUnique({
    where: { id },
    select: {
      id: true,
      inmovillaContactId: true,
      phoneCanonical: true,
    },
  });

  if (!advertiser) {
    return NextResponse.json(
      { ok: false, error: "MarketAdvertiser no encontrado" },
      { status: 404 },
    );
  }

  if (advertiser.inmovillaContactId) {
    return NextResponse.json({
      ok: true,
      status: "ALREADY_LINKED" as const,
      inmovillaContactId: advertiser.inmovillaContactId,
    });
  }

  if (!advertiser.phoneCanonical) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "El publicante no tiene telefono canonico; no se puede crear contacto en Inmovilla.",
      },
      { status: 400 },
    );
  }

  const job = await enqueueJob({
    type: "MARKET_PUSH_ADVERTISER_TO_INMOVILLA",
    payload: { advertiserId: advertiser.id },
    idempotencyKey: `market:advertiser:inmovilla:${advertiser.id}`,
  });

  return NextResponse.json({
    ok: true,
    status: "ENQUEUED" as const,
    jobId: job.id,
  });
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/market/advertisers/[id]/inmovilla-contact" },
  postHandler,
);

export const dynamic = "force-dynamic";
