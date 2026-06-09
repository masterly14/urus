import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store";
import {
  getSession,
  unauthorized,
  forbidden,
  isCeoOrAdmin,
} from "@/lib/auth/session";
import { cancelNotaEncargoQstashSchedules } from "@/lib/nota-encargo/schedule";

const TERMINAL_STATES = new Set([
  "CANCELADA",
  "FIRMADA",
  "DOCUMENTO_ENVIADO",
]);

/**
 * POST /api/captacion/nota-encargo/[id]/cancel
 *
 * Marca la sesión como CANCELADA, emite NOTA_ENCARGO_CANCELADA en el Event
 * Store y cancela cualquier job pendiente asociado a la sesión (recordatorio,
 * check de confirmación, envío de formulario y matching diferido).
 *
 * - Solo el comercial dueño de la sesión, o un rol CEO/admin, puede cancelar.
 * - Idempotente: si la sesión ya está en estado terminal, devuelve 200 sin
 *   reemitir eventos.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return unauthorized();

  if (!isCeoOrAdmin(session.role) && !session.comercialId) {
    return forbidden();
  }

  const { id } = await params;
  if (!id || typeof id !== "string") {
    return NextResponse.json(
      { ok: false, error: "Id de sesión inválido" },
      { status: 400 },
    );
  }

  const nota = await prisma.notaEncargoSession.findUnique({
    where: { id },
    select: {
      id: true,
      state: true,
      comercialId: true,
      propertyCode: true,
      propertyRef: true,
      refCatastral: true,
      propietarioPhone: true,
      visitDateTime: true,
      formularioQstashMessageId: true,
      matchingCheckQstashMessageId: true,
    },
  });

  if (!nota) {
    return NextResponse.json(
      { ok: false, error: "Nota de encargo no encontrada" },
      { status: 404 },
    );
  }

  if (!isCeoOrAdmin(session.role) && nota.comercialId !== session.comercialId) {
    return forbidden();
  }

  if (TERMINAL_STATES.has(nota.state)) {
    return NextResponse.json(
      {
        ok: true,
        sessionId: nota.id,
        alreadyCancelled: nota.state === "CANCELADA",
        terminal: nota.state,
      },
      { status: 200 },
    );
  }

  const previousState = nota.state;
  const cancelledBy = session.comercialId ?? session.userId;

  const qstashDeleted = await cancelNotaEncargoQstashSchedules(nota);

  await prisma.$transaction(async (tx) => {
    await tx.notaEncargoSession.update({
      where: { id: nota.id },
      data: { state: "CANCELADA" },
    });

    // Borra los jobs futuros (PENDING) asociados a esta sesión. Los handlers
    // de jobs en IN_PROGRESS releerán session.state y harán no-op gracias a la
    // guarda de estado en cada uno (`if (state !== "PENDING") return success`).
    await tx.jobQueue.deleteMany({
      where: {
        type: {
          in: [
            "NOTA_ENCARGO_RECORDATORIO",
            "NOTA_ENCARGO_CHECK_CONFIRMACION",
            "NOTA_ENCARGO_ENVIAR_FORMULARIO",
            "NOTA_ENCARGO_MATCHING_CHECK",
          ],
        },
        status: "PENDING",
        payload: { path: ["sessionId"], equals: nota.id },
      },
    });
  });

  await appendEvent({
    type: "NOTA_ENCARGO_CANCELADA",
    aggregateType: "PROPERTY",
    aggregateId: nota.propertyCode ?? nota.refCatastral ?? nota.id,
    payload: {
      sessionId: nota.id,
      propertyCode: nota.propertyCode,
      propertyRef: nota.propertyRef,
      refCatastral: nota.refCatastral,
      previousState,
      cancelledBy,
      cancelledAt: new Date().toISOString(),
      qstashDeleted,
    },
  });

  return NextResponse.json(
    { ok: true, sessionId: nota.id, previousState },
    { status: 200 },
  );
}
