/**
 * Job handler `SEND_POSTVENTA_FORM` (M9).
 *
 * Enviado por la cadencia post-venta en D0. Crea (idempotente) la sesión
 * `PostventaSurveySession` y envía el WhatsApp Flow de formulario inicial
 * vía plantilla Meta `postventa_formulario`.
 *
 * Si el comprador no rellena el formulario, la cadencia normal sigue
 * (soporte D+3, reseña D+10, etc.) pero no se agendan cumpleaños ni navidad:
 * esa programación depende de `POSTVENTA_FORMULARIO_COMPLETADO`.
 */

import type { JobRecord } from "@/lib/job-queue/types";
import type { HandlerResult } from "@/lib/workers/consumer/types";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store";
import { sendPostventaFormulario } from "@/lib/postventa/whatsapp";
import { getBuyerInfoForProperty } from "@/lib/postventa/resolve-buyer";

interface Payload {
  propertyCode: string;
  operacionId?: string;
  closedAt: string;
  sourceEventId?: string;
}

function parsePayload(raw: unknown): Payload | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.propertyCode !== "string" || typeof p.closedAt !== "string") {
    return null;
  }
  return {
    propertyCode: p.propertyCode,
    operacionId: typeof p.operacionId === "string" ? p.operacionId : undefined,
    closedAt: p.closedAt,
    sourceEventId: typeof p.sourceEventId === "string" ? p.sourceEventId : undefined,
  };
}

export async function handleSendPostventaForm(
  job: JobRecord,
): Promise<HandlerResult> {
  const payload = parsePayload(job.payload);
  if (!payload) {
    return {
      success: false,
      error: "SEND_POSTVENTA_FORM: payload incompleto",
      permanent: true,
    };
  }

  const { propertyCode, operacionId, sourceEventId } = payload;

  const buyer = await getBuyerInfoForProperty(propertyCode);
  if (!buyer || !buyer.phone) {
    console.warn(
      `[postventa:send-form] propertyCode=${propertyCode} — sin teléfono de comprador; el formulario no se envía`,
    );
    return { success: true };
  }

  const sessionOwnerId = operacionId ?? `propiedad:${propertyCode}`;
  const session = await prisma.postventaSurveySession.upsert({
    where: { operacionId: sessionOwnerId },
    create: {
      operacionId: sessionOwnerId,
      propertyCode,
      buyerPhone: buyer.phone,
      status: "SENT",
      buyerName: buyer.name || null,
      sentAt: new Date(),
    },
    update: {
      status: "SENT",
      buyerPhone: buyer.phone,
      buyerName: buyer.name || undefined,
      sentAt: new Date(),
    },
  });

  const operationRef = operacionId
    ? await resolveOperationRef(operacionId, propertyCode)
    : propertyCode;

  try {
    await sendPostventaFormulario(buyer.phone, {
      sessionId: session.id,
      buyerName: buyer.name || "cliente",
      operationRef,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[postventa:send-form] Error enviando formulario a ${buyer.phone} (session=${session.id}): ${message}`,
    );
    return { success: false, error: message };
  }

  await appendEvent({
    type: "POSTVENTA_FORMULARIO_ENVIADO",
    aggregateType: "OPERACION",
    aggregateId: sessionOwnerId,
    payload: {
      sessionId: session.id,
      propertyCode,
      buyerPhone: buyer.phone,
      sentAt: new Date().toISOString(),
    },
    causationId: sourceEventId,
  });

  console.log(
    `[postventa:send-form] Formulario enviado a ${buyer.phone} (session=${session.id} operacionId=${sessionOwnerId})`,
  );

  return { success: true };
}

async function resolveOperationRef(operacionId: string, propertyCode: string): Promise<string> {
  const op = await prisma.operacion.findUnique({
    where: { id: operacionId },
    select: { codigo: true },
  });
  return op?.codigo ?? propertyCode;
}
