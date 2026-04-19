/**
 * Schedules the Parte de Visita flow after a visit is confirmed.
 *
 * Called from the visit-scheduling orchestrator when the session
 * transitions to VISIT_CONFIRMED. Creates a ParteVisitaSession
 * with pre-filled property data and enqueues a job to send the
 * WhatsApp Flow at the visit start time.
 */

import { prisma } from "@/lib/prisma";
import { enqueueJob } from "@/lib/job-queue";
import { extractPropertyDataFromRaw } from "@/lib/workers/ingestion/tasks/tasks-parser";
import type { VisitSchedulingSession } from "@/app/generated/prisma/client";

export async function scheduleParteVisita(
  visitSession: VisitSchedulingSession,
): Promise<void> {
  if (!visitSession.confirmedSlotStart) {
    console.warn(
      `[parte-visita] Cannot schedule: session ${visitSession.id} has no confirmedSlotStart`,
    );
    return;
  }

  const existing = await prisma.parteVisitaSession.findUnique({
    where: { visitSessionId: visitSession.id },
    select: { id: true },
  });
  if (existing) {
    console.log(
      `[parte-visita] ParteVisitaSession already exists for visit ${visitSession.id} — skipping`,
    );
    return;
  }

  const property = await prisma.propertyCurrent.findUnique({
    where: { codigo: visitSession.propertyCode },
  });
  if (!property) {
    console.warn(
      `[parte-visita] PropertyCurrent not found for ${visitSession.propertyCode} — skipping`,
    );
    return;
  }

  const snapshot = await prisma.propertySnapshot.findFirst({
    where: { codigo: visitSession.propertyCode },
    orderBy: { lastSeenAt: "desc" },
    select: { raw: true },
  });

  let direccion: string;
  let tipoOperacion: string;
  let precio: number;

  if (snapshot?.raw && typeof snapshot.raw === "object") {
    const raw = snapshot.raw as Record<string, unknown>;
    const extracted = extractPropertyDataFromRaw(raw, {
      ciudad: property.ciudad,
      zona: property.zona,
    });
    direccion = extracted.direccion;
    tipoOperacion = extracted.tipoOperacion;
    precio = extracted.precio;
  } else {
    direccion = [property.zona, property.ciudad].filter(Boolean).join(", ");
    tipoOperacion = "VENTA";
    precio = property.precio;
  }

  const session = await prisma.parteVisitaSession.create({
    data: {
      visitSessionId: visitSession.id,
      propertyCode: visitSession.propertyCode,
      propertyRef: property.ref,
      comercialId: visitSession.comercialId,
      buyerPhone: visitSession.buyerWaId,
      visitDateTime: visitSession.confirmedSlotStart,
      direccion,
      tipoOperacion,
      precio,
    },
  });

  await enqueueJob({
    type: "PARTE_VISITA_ENVIAR_FORMULARIO",
    payload: { sessionId: session.id },
    availableAt: visitSession.confirmedSlotStart,
    idempotencyKey: `parte_visita_formulario:${session.id}`,
  });

  console.log(
    `[parte-visita] Scheduled for visit ${visitSession.id} — session=${session.id} at=${visitSession.confirmedSlotStart.toISOString()}`,
  );
}
