import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withObservedRoute } from "@/lib/observability";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { enqueueJob } from "@/lib/job-queue";
import { getPublicAppUrl } from "@/lib/microsite/app-url";

interface MatchEventPayload {
  demandId?: string;
  propertyId?: string;
  totalScore?: number;
}

/**
 * POST /api/matching/cruces/:id/send
 *
 * Envía el WhatsApp de match al comprador de forma manual.
 * El comercial valida el cruce y decide cuándo enviar.
 */
const postHandler = async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const { id: eventId } = await params;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, type: true, payload: true },
  });

  if (!event || event.type !== "MATCH_GENERADO") {
    return NextResponse.json(
      { ok: false, error: "Evento MATCH_GENERADO no encontrado" },
      { status: 404 },
    );
  }

  const payload = event.payload as MatchEventPayload | null;
  if (!payload?.demandId || !payload?.propertyId) {
    return NextResponse.json(
      { ok: false, error: "Payload del evento incompleto" },
      { status: 400 },
    );
  }

  const existingJob = await prisma.jobQueue.findFirst({
    where: {
      type: "SEND_WHATSAPP_MATCH",
      sourceEventId: eventId,
      status: { in: ["COMPLETED", "IN_PROGRESS", "PENDING"] },
    },
    select: { id: true, status: true },
  });

  if (existingJob) {
    return NextResponse.json(
      { ok: false, error: "Ya se envió o se está enviando el WhatsApp para este cruce", jobStatus: existingJob.status },
      { status: 409 },
    );
  }

  const demand = await prisma.demandCurrent.findUnique({
    where: { codigo: payload.demandId },
    select: { telefono: true, nombre: true },
  });

  if (!demand?.telefono) {
    return NextResponse.json(
      { ok: false, error: "El comprador no tiene teléfono registrado" },
      { status: 400 },
    );
  }

  const appUrl = getPublicAppUrl();
  const enlace = `${appUrl}/matching/cruces`;

  await enqueueJob({
    type: "SEND_WHATSAPP_MATCH",
    payload: {
      buyerPhone: demand.telefono,
      nombre: demand.nombre ?? "comprador",
      enlacePropiedad: enlace,
      demandId: payload.demandId,
      propertyId: payload.propertyId,
    },
    priority: 20,
    idempotencyKey: `send_wa_match:${eventId}`,
    sourceEventId: eventId,
  });

  console.log(
    `[api:matching] WhatsApp de match enviado manualmente por ${session.nombre || "comercial"} — event=${eventId} demand=${payload.demandId} property=${payload.propertyId}`,
  );

  return NextResponse.json({ ok: true });
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/matching/cruces/:id/send" },
  postHandler,
);
