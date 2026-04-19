/**
 * Handler de MATCH_GENERADO.
 *
 * Cuando el cruce automático (matching-handler) detecta un match entre
 * una propiedad y una demanda, este handler:
 *
 * 1. Resuelve el teléfono del comprador desde demands_current.
 * 2. Encola NOTIFY_LEAD_WHATSAPP al comercial asignado.
 * 3. Si hay teléfono del comprador, encola SEND_WHATSAPP_MATCH (H21: asíncrono).
 * 4. Registra el match en CommercialLeadFact (analytics best-effort).
 */

import type { Event } from "@/types/domain";
import type { EnqueueJobInput, JobRecord } from "@/lib/job-queue/types";
import type { HandlerResult } from "./types";
import { prisma } from "@/lib/prisma";
import { resolveComercialFromAgente } from "@/lib/routing/resolve-comercial";
import { sendMatchNotification } from "@/lib/whatsapp/send";
import { getPublicAppUrl } from "@/lib/microsite/app-url";
import { appendEvent } from "@/lib/event-store";
import type { JsonValue } from "@/lib/event-store/types";
import { normalizeWhatsAppDigits } from "@/lib/microsite/buyer-phone";

interface MatchGeneradoPayload {
  demandId: string;
  demandRef?: string;
  demandNombre?: string;
  propertyId: string;
  propertyRef?: string;
  totalScore: number;
  matchScore?: Record<string, unknown>;
}

function parsePayload(raw: unknown): MatchGeneradoPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.demandId !== "string" || typeof p.propertyId !== "string") {
    return null;
  }
  return {
    demandId: p.demandId,
    demandRef: typeof p.demandRef === "string" ? p.demandRef : undefined,
    demandNombre: typeof p.demandNombre === "string" ? p.demandNombre : undefined,
    propertyId: p.propertyId,
    propertyRef: typeof p.propertyRef === "string" ? p.propertyRef : undefined,
    totalScore: typeof p.totalScore === "number" ? p.totalScore : 0,
    matchScore:
      p.matchScore && typeof p.matchScore === "object"
        ? (p.matchScore as Record<string, unknown>)
        : undefined,
  };
}

export async function handleMatchGenerado(
  event: Event,
): Promise<HandlerResult> {
  const payload = parsePayload(event.payload);
  if (!payload) {
    console.warn(
      `[consumer:match] MATCH_GENERADO id=${event.id} — payload incompleto, skip`,
    );
    return { success: true };
  }

  const { demandId, propertyId, totalScore } = payload;

  console.log(
    `[consumer:match] MATCH_GENERADO demandId=${demandId} propertyId=${propertyId} score=${totalScore}`,
  );

  const followUpJobs: EnqueueJobInput[] = [];

  const demand = await prisma.demandCurrent.findUnique({
    where: { codigo: demandId },
    select: { telefono: true, nombre: true, agente: true },
  });

  const property = await prisma.propertyCurrent.findUnique({
    where: { codigo: propertyId },
    select: { titulo: true, precio: true, ciudad: true, zona: true, agente: true },
  });

  const agentName = demand?.agente ?? property?.agente;
  const comercial = agentName
    ? await resolveComercialFromAgente(agentName)
    : null;

  if (comercial?.telefono) {
    const propertyLabel = property
      ? `${property.titulo ?? propertyId} (${property.ciudad ?? ""} ${property.zona ?? ""}) — ${property.precio?.toLocaleString("es-ES") ?? "?"} €`
      : propertyId;

    followUpJobs.push({
      type: "NOTIFY_LEAD_WHATSAPP",
      payload: {
        assignedAgentTelefono: comercial.telefono,
        leadAggregateId: demandId,
        score: totalScore,
        slaLevel: "MATCH",
        reasons: [`Match con propiedad ${propertyLabel}`],
        assignedAgentId: comercial.id,
        assignedAgentNombre: comercial.nombre,
      },
      priority: 20,
      idempotencyKey: `notify_match_comercial:${event.id}`,
      sourceEventId: event.id,
    });
  }

  const buyerPhone = demand?.telefono;
  if (buyerPhone) {
    // El envío al comprador ya NO es automático. El comercial lo dispara
    // manualmente desde la UI de cruces (/platform/matching/cruces)
    // a través de POST /api/matching/cruces/:id/send.
    console.log(
      `[consumer:match] demanda=${demandId} tiene teléfono — WhatsApp pendiente de validación del comercial`,
    );
  } else {
    console.log(
      `[consumer:match] Sin teléfono de comprador para demanda=${demandId} — solo notificación al comercial`,
    );
  }

  return { success: true, followUpJobs };
}

/**
 * H21: Handler de SEND_WHATSAPP_MATCH.
 *
 * Envía el WhatsApp de notificación de match al comprador de forma asíncrona.
 * El retry/backoff ante errores transitorios (429, 5xx) ya está implementado en
 * `lib/whatsapp/client.ts` (H16). Los errores devueltos como `success: false`
 * son reintentados por la infraestructura de job-queue salvo `permanent: true`.
 */
interface SendWhatsAppMatchPayload {
  buyerPhone: string;
  nombre: string;
  enlacePropiedad: string;
  demandId?: string;
  propertyId?: string;
}

function parseSendWhatsAppMatchPayload(
  raw: unknown,
): SendWhatsAppMatchPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (
    typeof p.buyerPhone !== "string" ||
    typeof p.nombre !== "string" ||
    typeof p.enlacePropiedad !== "string"
  ) {
    return null;
  }
  return {
    buyerPhone: p.buyerPhone,
    nombre: p.nombre,
    enlacePropiedad: p.enlacePropiedad,
    demandId: typeof p.demandId === "string" ? p.demandId : undefined,
    propertyId: typeof p.propertyId === "string" ? p.propertyId : undefined,
  };
}

export async function handleSendWhatsAppMatch(
  job: JobRecord,
): Promise<HandlerResult> {
  const payload = parseSendWhatsAppMatchPayload(job.payload);
  if (!payload) {
    return {
      success: false,
      error: "SEND_WHATSAPP_MATCH sin payload válido (buyerPhone/nombre/enlacePropiedad)",
      permanent: true,
    };
  }

  let wamid: string | undefined;
  try {
    const result = await sendMatchNotification(payload.buyerPhone, {
      nombre: payload.nombre,
      enlacePropiedad: payload.enlacePropiedad,
    });
    wamid = result.messages?.[0]?.id;
    console.log(
      `[consumer] SEND_WHATSAPP_MATCH job ${job.id} — enviado a ${payload.buyerPhone}${payload.demandId ? ` demanda=${payload.demandId}` : ""}${payload.propertyId ? ` propiedad=${payload.propertyId}` : ""} wamid=${wamid ?? "N/A"}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[consumer] SEND_WHATSAPP_MATCH job ${job.id} — error: ${msg}`,
    );
    return { success: false, error: msg };
  }

  // Correlación para el NLU de entrada: el comprador responderá al mensaje
  // de match (plantilla con quick replies o texto libre) y el handler de
  // WHATSAPP_RECIBIDO necesita poder resolver `demandId` a partir de:
  //   a) context.message_id → busca WHATSAPP_ENVIADO con mismo messageId
  //   b) whatsAppBuyerSession del waId
  //
  // Sin esto, los compradores que reciben el aviso de match sin haber pasado
  // previamente por un microsite quedan sin contexto y el handler hace no-op.
  if (payload.demandId) {
    const waId = normalizeWhatsAppDigits(payload.buyerPhone);
    if (waId.length >= 9) {
      if (wamid) {
        try {
          await appendEvent({
            type: "WHATSAPP_ENVIADO",
            aggregateType: "WHATSAPP_CONVERSATION",
            aggregateId: waId,
            payload: {
              messageId: wamid,
              demandId: payload.demandId,
              propertyId: payload.propertyId,
              kind: "match_notification",
              enlacePropiedad: payload.enlacePropiedad,
            } as unknown as JsonValue,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(
            `[consumer] SEND_WHATSAPP_MATCH job ${job.id} — append WHATSAPP_ENVIADO falló: ${msg}`,
          );
        }
      }

      try {
        await prisma.whatsAppBuyerSession.upsert({
          where: { waId },
          create: {
            waId,
            demandId: payload.demandId,
          },
          update: {
            demandId: payload.demandId,
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          `[consumer] SEND_WHATSAPP_MATCH job ${job.id} — upsert whatsAppBuyerSession falló: ${msg}`,
        );
      }
    } else {
      console.warn(
        `[consumer] SEND_WHATSAPP_MATCH job ${job.id} — buyerPhone no normalizable a waId, se omite correlación NLU`,
      );
    }
  }

  return { success: true };
}
