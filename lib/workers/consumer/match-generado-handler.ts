/**
 * Handler de MATCH_GENERADO.
 *
 * Cuando el cruce automático (matching-handler) detecta un match entre
 * una propiedad y una demanda, este handler:
 *
 * 1. Resuelve el teléfono del comprador desde demands_current.
 * 2. Encola NOTIFY_LEAD_WHATSAPP al comercial asignado.
 * 3. Si hay teléfono del comprador, envía en caliente el WhatsApp de match
 *    al comprador (sin pasar por job queue) vía `sendMatchWhatsAppHot`.
 * 4. Registra el match en CommercialLeadFact (analytics best-effort).
 */

import type { Event } from "@/types/domain";
import type { EnqueueJobInput, JobRecord } from "@/lib/job-queue/types";
import type { HandlerResult } from "./types";
import { prisma } from "@/lib/prisma";
import { resolveComercialFromAgente } from "@/lib/routing/resolve-comercial";
import { sendMatchNotification } from "@/lib/whatsapp/send";
import { normalizeWhatsAppDigits } from "@/lib/microsite/buyer-phone";
import { sendMatchWhatsAppHot } from "@/lib/matching/send-match-whatsapp";

interface MatchGeneradoPayload {
  demandId: string;
  demandRef?: string;
  demandNombre?: string;
  propertyId: string;
  propertyRef?: string;
  totalScore: number;
  matchScore?: Record<string, unknown>;
  /**
   * Origen del MATCH_GENERADO. Usado para gobernar canales:
   * - `auto_demand_creada` / `auto_demand_modificada`: el match se generó
   *   automáticamente al entrar/modificarse la demanda. El comprador no
   *   recibe WhatsApp directo (lo recibirá agrupado en el microsite); el
   *   comercial sí recibe NOTIFY_LEAD_WHATSAPP por match.
   * - `rematch_manual` / `rematch_inline`: rematch lanzado por CEO/Admin.
   *   Mantiene el comportamiento legacy (WhatsApp al comprador en caliente).
   * - undefined: emitido desde el lado-propiedad (PROPIEDAD_CREADA /
   *   PROPIEDAD_MODIFICADA). Mantiene el comportamiento legacy.
   */
  source?: string;
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
    source: typeof p.source === "string" ? p.source : undefined,
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

  /**
   * Los matches generados desde el lado-demanda (DEMANDA_CREADA /
   * DEMANDA_MODIFICADA via `MATCH_DEMAND_AGAINST_INTERNAL`) no envían
   * WhatsApp directo al comprador. El flujo canónico para el comprador
   * es: mensaje inicial NLU → microsite agrupado tras validación. Si
   * mandáramos `sendMatchWhatsAppHot` aquí, una demanda con 20 cruces
   * generaría 20 WhatsApps al comprador, pisando la conversación NLU
   * y rompiendo el patrón de microsite.
   */
  const isAutoFromDemandSide =
    typeof payload.source === "string" &&
    payload.source.startsWith("auto_demand_");

  console.log(
    `[consumer:match] MATCH_GENERADO demandId=${demandId} propertyId=${propertyId} score=${totalScore} source=${payload.source ?? "(legacy)"}`,
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

  if (isAutoFromDemandSide) {
    console.log(
      `[consumer:match] omitido WhatsApp al comprador demandId=${demandId} property=${propertyId} (source=${payload.source}); flujo canónico vía microsite agrupado`,
    );
  } else {
    const buyerPhone = demand?.telefono?.trim();
    if (buyerPhone) {
      const buyerName = demand?.nombre ?? payload.demandNombre ?? "comprador";
      const sendResult = await sendMatchWhatsAppHot({
        matchEventId: event.id,
        demandId,
        propertyId,
        buyerPhone,
        buyerName,
        source: "consumer:match",
      });

      if (!sendResult.ok) {
        console.error(
          `[consumer:match] fallo enviando WhatsApp en caliente demanda=${demandId} property=${propertyId} event=${event.id}: ${sendResult.error}`,
        );
        // Devolvemos error para que el PROCESS_EVENT se reintente; la
        // idempotencia por causationId evita duplicar el envío al comprador.
        return { success: false, error: sendResult.error ?? "Error enviando WhatsApp" };
      }

      console.log(
        `[consumer:match] WhatsApp ${sendResult.alreadySent ? "ya enviado" : "enviado en caliente"} a demanda=${demandId} property=${propertyId} wamid=${sendResult.wamid ?? "N/A"}`,
      );
    } else {
      console.log(
        `[consumer:match] Sin teléfono de comprador para demanda=${demandId} — solo notificación al comercial`,
      );
    }
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
    }, {
      trace: {
        source: "consumer",
        kind: "match_notification",
        aggregateId: normalizeWhatsAppDigits(payload.buyerPhone),
        causationId: job.sourceEventId ?? null,
        payload: {
          demandId: payload.demandId ?? null,
          propertyId: payload.propertyId ?? null,
          enlacePropiedad: payload.enlacePropiedad,
        },
      },
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
