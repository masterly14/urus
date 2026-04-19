import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store";
import { isAuthorized } from "@/lib/api/cron-auth";
import type { ReferralStatus } from "@/app/generated/prisma/client";
import { withObservedRoute } from "@/lib/observability";


/**
 * POST /api/referidos — Captura de referido desde formulario publico.
 * No requiere auth (es publico, el cliente accede via enlace WhatsApp).
 */
const postHandler = async (request: Request) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Body JSON inválido" },
      { status: 400 },
    );
  }

  const propertyCode = typeof body.propertyCode === "string" ? body.propertyCode.trim() : "";
  const referredName = typeof body.referredName === "string" ? body.referredName.trim() : "";
  const referredPhone = typeof body.referredPhone === "string" ? body.referredPhone.trim() : "";
  const referredEmail = typeof body.referredEmail === "string" ? body.referredEmail.trim() : "";
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";

  if (!propertyCode || !referredName || !referredPhone) {
    return NextResponse.json(
      { error: "Campos obligatorios: propertyCode, referredName, referredPhone" },
      { status: 400 },
    );
  }

  const closedEvent = await prisma.event.findFirst({
    where: {
      type: "OPERACION_CERRADA",
      aggregateId: propertyCode,
    },
    orderBy: { occurredAt: "desc" },
    select: { payload: true },
  });

  const eventPayload = (closedEvent?.payload ?? {}) as Record<string, unknown>;
  const operacionId = typeof eventPayload.operacionId === "string"
    ? eventPayload.operacionId
    : undefined;
  const referrerName = typeof eventPayload.clientName === "string"
    ? eventPayload.clientName
    : "Cliente";
  const referrerPhone = typeof eventPayload.buyerPhone === "string"
    ? eventPayload.buyerPhone
    : "";

  const referral = await prisma.referral.create({
    data: {
      propertyCode,
      referrerName,
      referrerPhone,
      referredName,
      referredPhone,
      referredEmail,
      notes,
    },
  });

  await appendEvent({
    type: "REFERIDO_CAPTURADO",
    aggregateType: "OPERACION",
    aggregateId: propertyCode,
    payload: {
      referralId: referral.id,
      operacionId,
      referredName,
      referredPhone,
      referredEmail: referredEmail || null,
      referrerName,
      referrerPhone: referrerPhone || null,
    },
  });

  return NextResponse.json({ ok: true, referralId: referral.id }, { status: 201 });
}

export const POST = withObservedRoute({ method: "POST", route: "/api/referidos" }, postHandler);

/**
 * GET /api/referidos — Listado de referidos (bandeja admin).
 * Requiere auth (CRON_SECRET).
 */
const getHandler = async (request: Request) => {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status") as ReferralStatus | null;
  const comercialId = url.searchParams.get("comercialId");
  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);
  const offset = Number(url.searchParams.get("offset")) || 0;

  const where: Record<string, unknown> = {};
  if (statusFilter) where.status = statusFilter;
  if (comercialId) where.comercialId = comercialId;

  const [referrals, total] = await Promise.all([
    prisma.referral.findMany({
      where,
      include: { comercial: { select: { id: true, nombre: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.referral.count({ where }),
  ]);

  return NextResponse.json({ referrals, total, limit, offset });
}

export const GET = withObservedRoute({ method: "GET", route: "/api/referidos" }, getHandler);
