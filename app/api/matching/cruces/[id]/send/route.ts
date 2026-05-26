import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withObservedRoute } from "@/lib/observability";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { sendMatchWhatsAppHot } from "@/lib/matching/send-match-whatsapp";

interface MatchEventPayload {
  demandId?: string;
  demandNombre?: string;
  propertyId?: string;
  totalScore?: number;
}

/**
 * POST /api/matching/cruces/:id/send
 *
 * Envía en caliente el WhatsApp de match al comprador.
 * No pasa por la cola de jobs: la llamada a Meta es síncrona y el resultado
 * (wamid o error) se devuelve al cliente para feedback real en la UI.
 *
 * Idempotente por `causationId` (matchEventId) sobre evento WHATSAPP_ENVIADO.
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

  const demand = await prisma.demandCurrent.findUnique({
    where: { codigo: payload.demandId },
    select: { telefono: true, nombre: true },
  });

  if (!demand?.telefono?.trim()) {
    return NextResponse.json(
      { ok: false, error: "El comprador no tiene teléfono registrado" },
      { status: 400 },
    );
  }

  const buyerName = demand.nombre ?? payload.demandNombre ?? "comprador";

  const result = await sendMatchWhatsAppHot({
    matchEventId: eventId,
    demandId: payload.demandId,
    propertyId: payload.propertyId,
    buyerPhone: demand.telefono,
    buyerName,
    source: "api:matching",
  });

  if (!result.ok) {
    if (result.invalidated) {
      return NextResponse.json(
        { ok: false, error: result.error ?? "Cruce invalidado" },
        { status: 409 },
      );
    }

    console.error(
      `[api:matching] Fallo al enviar WhatsApp event=${eventId} demand=${payload.demandId}: ${result.error}`,
    );
    return NextResponse.json(
      { ok: false, error: result.error ?? "Error enviando WhatsApp" },
      { status: 502 },
    );
  }

  console.log(
    `[api:matching] WhatsApp ${result.alreadySent ? "ya enviado" : "enviado"} por ${session.nombre || "comercial"} — event=${eventId} demand=${payload.demandId} property=${payload.propertyId} wamid=${result.wamid ?? "N/A"}`,
  );

  return NextResponse.json({
    ok: true,
    wamid: result.wamid ?? null,
    alreadySent: result.alreadySent ?? false,
  });
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/matching/cruces/:id/send" },
  postHandler,
);
