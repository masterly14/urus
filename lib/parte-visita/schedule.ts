/**
 * Programación del Parte de Visita.
 *
 * Cuando se confirma una visita, se crea la `ParteVisitaSession` y se publica
 * un mensaje diferido en **Upstash QStash** con `notBefore = visitDateTime`
 * que apunta al endpoint dedicado `/api/parte-visita/send`. QStash invocará
 * ese endpoint en el instante exacto de la visita y se enviará el WhatsApp
 * Flow en caliente, sin pasar por la cola interna ni por ningún cron poller.
 *
 * No se usa `job_queue` para este flujo: la cola compartida tiene throughput
 * limitado y puede acumular backlog (ver `docs/visitas-gestion-comercial.md`).
 */

import { Client } from "@upstash/qstash";
import { prisma } from "@/lib/prisma";
import {
  extractDireccionFromRaw,
  resolveOperationType,
} from "@/lib/nota-encargo/utils";
import { getPublicAppUrl } from "@/lib/microsite/app-url";
import type { VisitSchedulingSession } from "@prisma/client";

const SEND_ROUTE = "/api/parte-visita/send";

export type ParteVisitaScheduleDetails = {
  visitSessionId: string;
  propertyCode: string;
  propertyRef: string;
  draftDemandId?: string | null;
  comercialId: string;
  buyerPhone: string;
  visitDateTime: Date;
  direccion: string;
  tipoOperacion: string;
  precio: number;
};

export class ParteVisitaScheduleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParteVisitaScheduleError";
  }
}

function getQstashClient(): Client {
  const token = process.env.QSTASH_TOKEN?.trim();
  if (!token) {
    throw new ParteVisitaScheduleError(
      "QSTASH_TOKEN no configurado: imposible programar el Parte de Visita en QStash",
    );
  }
  return new Client({ token });
}

/**
 * Publica en QStash el envío del Parte de Visita para una sesión existente,
 * apuntando a `visitDateTime` (o ejecución inmediata si la fecha ya pasó).
 * Devuelve el `messageId` de QStash para trazabilidad.
 */
export async function publishParteVisitaSendSchedule(params: {
  parteVisitaSessionId: string;
  visitDateTime: Date;
}): Promise<{ messageId: string; sendAtIso: string }> {
  const client = getQstashClient();
  const baseUrl = getPublicAppUrl();
  const now = Date.now();
  const sendAt = Math.max(Math.floor(params.visitDateTime.getTime() / 1000), Math.floor(now / 1000));

  const response = await client.publishJSON({
    url: `${baseUrl}${SEND_ROUTE}`,
    body: { sessionId: params.parteVisitaSessionId },
    notBefore: sendAt,
    retries: 3,
  });

  const messageId =
    typeof (response as { messageId?: unknown }).messageId === "string"
      ? ((response as { messageId: string }).messageId)
      : "";

  return {
    messageId,
    sendAtIso: new Date(sendAt * 1000).toISOString(),
  };
}

export async function scheduleParteVisitaFromDetails(
  details: ParteVisitaScheduleDetails,
): Promise<void> {
  const existing = await prisma.parteVisitaSession.findUnique({
    where: { visitSessionId: details.visitSessionId },
    select: { id: true },
  });
  if (existing) {
    console.log(
      `[parte-visita] ParteVisitaSession already exists for visit ${details.visitSessionId} — skipping`,
    );
    return;
  }

  const session = await prisma.parteVisitaSession.create({
    data: {
      visitSessionId: details.visitSessionId,
      propertyCode: details.propertyCode,
      propertyRef: details.propertyRef,
      draftDemandId: details.draftDemandId ?? null,
      comercialId: details.comercialId,
      buyerPhone: details.buyerPhone,
      visitDateTime: details.visitDateTime,
      direccion: details.direccion,
      tipoOperacion: details.tipoOperacion,
      precio: details.precio,
    },
  });

  const { messageId, sendAtIso } = await publishParteVisitaSendSchedule({
    parteVisitaSessionId: session.id,
    visitDateTime: details.visitDateTime,
  });

  console.log(
    `[parte-visita] QStash scheduled for visit ${details.visitSessionId} — session=${session.id} sendAt=${sendAtIso} qstashMessageId=${messageId || "(unknown)"}`,
  );
}

export async function scheduleParteVisita(
  visitSession: VisitSchedulingSession,
): Promise<void> {
  if (!visitSession.confirmedSlotStart) {
    console.warn(
      `[parte-visita] Cannot schedule: session ${visitSession.id} has no confirmedSlotStart`,
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

  // Prioridad: dirección real desde el snapshot (calle/numero/cp). Si no hay
  // datos de calle, fallback a zona/ciudad de PropertyCurrent. El precio y el
  // tipo de operación los tomamos de PropertyCurrent (siempre presente, no del
  // raw que puede no traer precioinmo/precioalq).
  const direccion = snapshot?.raw && typeof snapshot.raw === "object"
    ? extractDireccionFromRaw(snapshot.raw as Record<string, unknown>, {
        ciudad: property.ciudad,
        zona: property.zona,
      }) || [property.zona, property.ciudad].filter(Boolean).join(", ")
    : [property.zona, property.ciudad].filter(Boolean).join(", ");
  const tipoOperacion = resolveOperationType(property.tipoOfer);
  const precio = property.precio;

  await scheduleParteVisitaFromDetails({
    visitSessionId: visitSession.id,
    propertyCode: visitSession.propertyCode,
    propertyRef: property.ref,
    draftDemandId: visitSession.draftDemandId,
    comercialId: visitSession.comercialId,
    buyerPhone: visitSession.buyerWaId,
    visitDateTime: visitSession.confirmedSlotStart,
    direccion,
    tipoOperacion,
    precio,
  });
}
