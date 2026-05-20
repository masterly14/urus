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
 *
 * Tolerancia a fallos del publish (post-mortem 2026-05-20):
 *   Si QStash falla AFTER de crear la sesión, esta función NO lanza: deja la
 *   sesión creada con `qstashMessageId=null` y `schedulePublishError` poblado.
 *   Una llamada posterior con el mismo `visitSessionId` reintenta el publish
 *   en vez de hacer un `return` ciego (bug original). El cron
 *   `/api/cron/parte-visita-rescate` también barre las sesiones huérfanas
 *   (PENDING + visitDateTime ≤ now) y las republica o rescata.
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

export type ScheduleParteVisitaOutcome =
  | {
      status: "scheduled";
      parteVisitaSessionId: string;
      qstashMessageId: string;
      sendAtIso: string;
      created: boolean;
      republished: boolean;
    }
  | {
      status: "already_scheduled";
      parteVisitaSessionId: string;
      qstashMessageId: string;
    }
  | {
      status: "publish_failed";
      parteVisitaSessionId: string;
      error: string;
    }
  | {
      status: "skipped_terminal";
      parteVisitaSessionId: string;
      state: string;
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
 *
 * NO persiste nada — solo habla con QStash. La persistencia del messageId la
 * hace `scheduleParteVisitaFromDetails` para mantener `lib/parte-visita/schedule.ts`
 * como única fuente de verdad sobre el estado del schedule.
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

/**
 * Crea (o reutiliza) la `ParteVisitaSession` y se asegura de que tenga un
 * schedule activo en QStash. Idempotente en ambos niveles:
 *
 *   1. Si ya existe la sesión y tiene `qstashMessageId`, no toca nada.
 *   2. Si existe pero NO tiene `qstashMessageId` (publish anterior falló),
 *      republica y persiste el nuevo `qstashMessageId`. Este es el fix del
 *      bug histórico: antes hacía `return` ciego dejando huérfanas.
 *   3. Si no existe, crea la sesión y publica.
 *
 * Tolerancia a fallos del publish: si QStash falla, NO se lanza al caller —
 * se persiste el error en `schedulePublishError` y se devuelve un outcome
 * `publish_failed`. El caller decide si quiere romper su flujo o seguir
 * (el cron `/api/cron/parte-visita-rescate` rescatará la sesión cuando
 * llegue su `visitDateTime`).
 *
 * Si el state ya está en una transición posterior (`FORMULARIO_ENVIADO`,
 * `FIRMADA`, etc.), tampoco hacemos nada: outcome `skipped_terminal`.
 */
export async function scheduleParteVisitaFromDetails(
  details: ParteVisitaScheduleDetails,
): Promise<ScheduleParteVisitaOutcome> {
  const existing = await prisma.parteVisitaSession.findUnique({
    where: { visitSessionId: details.visitSessionId },
    select: { id: true, state: true, qstashMessageId: true },
  });

  if (existing) {
    if (existing.state !== "PENDING") {
      console.log(
        `[parte-visita] Session ${existing.id} no PENDING (state=${existing.state}) — no se reprograma`,
      );
      return {
        status: "skipped_terminal",
        parteVisitaSessionId: existing.id,
        state: existing.state,
      };
    }

    if (existing.qstashMessageId) {
      console.log(
        `[parte-visita] Session ${existing.id} ya tiene qstashMessageId=${existing.qstashMessageId} — no se reprograma`,
      );
      return {
        status: "already_scheduled",
        parteVisitaSessionId: existing.id,
        qstashMessageId: existing.qstashMessageId,
      };
    }

    return republishExistingSession({
      parteVisitaSessionId: existing.id,
      visitDateTime: details.visitDateTime,
    });
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
    select: { id: true },
  });

  return publishAndPersist({
    parteVisitaSessionId: session.id,
    visitDateTime: details.visitDateTime,
    created: true,
    republished: false,
  });
}

/**
 * Reintenta el publish para una sesión que ya existe pero no tiene
 * `qstashMessageId`. Usado por `scheduleParteVisitaFromDetails` cuando la
 * llamada original falló y por el cron de rescate.
 */
export async function republishExistingSession(params: {
  parteVisitaSessionId: string;
  visitDateTime: Date;
}): Promise<ScheduleParteVisitaOutcome> {
  return publishAndPersist({
    parteVisitaSessionId: params.parteVisitaSessionId,
    visitDateTime: params.visitDateTime,
    created: false,
    republished: true,
  });
}

async function publishAndPersist(params: {
  parteVisitaSessionId: string;
  visitDateTime: Date;
  created: boolean;
  republished: boolean;
}): Promise<ScheduleParteVisitaOutcome> {
  try {
    const { messageId, sendAtIso } = await publishParteVisitaSendSchedule({
      parteVisitaSessionId: params.parteVisitaSessionId,
      visitDateTime: params.visitDateTime,
    });

    await prisma.parteVisitaSession.update({
      where: { id: params.parteVisitaSessionId },
      data: {
        qstashMessageId: messageId || null,
        schedulePublishError: null,
        scheduleAttempts: { increment: 1 },
      },
    });

    console.log(
      `[parte-visita] QStash scheduled — session=${params.parteVisitaSessionId} sendAt=${sendAtIso} qstashMessageId=${messageId || "(unknown)"} created=${params.created} republished=${params.republished}`,
    );

    return {
      status: "scheduled",
      parteVisitaSessionId: params.parteVisitaSessionId,
      qstashMessageId: messageId,
      sendAtIso,
      created: params.created,
      republished: params.republished,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await prisma.parteVisitaSession.update({
        where: { id: params.parteVisitaSessionId },
        data: {
          schedulePublishError: message.slice(0, 500),
          scheduleAttempts: { increment: 1 },
        },
      });
    } catch (persistErr) {
      console.error(
        `[parte-visita] No se pudo persistir schedulePublishError en ${params.parteVisitaSessionId}:`,
        persistErr instanceof Error ? persistErr.message : persistErr,
      );
    }

    console.error(
      `[parte-visita] QStash publish FAILED — session=${params.parteVisitaSessionId} error="${message}"`,
    );

    return {
      status: "publish_failed",
      parteVisitaSessionId: params.parteVisitaSessionId,
      error: message,
    };
  }
}

export async function scheduleParteVisita(
  visitSession: VisitSchedulingSession,
): Promise<ScheduleParteVisitaOutcome | null> {
  if (!visitSession.confirmedSlotStart) {
    console.warn(
      `[parte-visita] Cannot schedule: session ${visitSession.id} has no confirmedSlotStart`,
    );
    return null;
  }

  const property = await prisma.propertyCurrent.findUnique({
    where: { codigo: visitSession.propertyCode },
  });
  if (!property) {
    console.warn(
      `[parte-visita] PropertyCurrent not found for ${visitSession.propertyCode} — skipping`,
    );
    return null;
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

  return scheduleParteVisitaFromDetails({
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
