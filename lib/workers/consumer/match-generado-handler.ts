/**
 * Handler de MATCH_GENERADO.
 *
 * Cuando el cruce automático (matching-handler) detecta un match entre
 * una propiedad y una demanda, este handler:
 *
 * 1. Resuelve el teléfono del comprador desde demands_current.
 * 2. Encola NOTIFY_LEAD_WHATSAPP al comercial asignado.
 * 3. Si hay teléfono del comprador, envía WhatsApp con la propiedad.
 * 4. Registra el match en CommercialLeadFact (analytics best-effort).
 */

import type { Event } from "@/types/domain";
import type { EnqueueJobInput } from "@/lib/job-queue/types";
import type { HandlerResult } from "./types";
import { prisma } from "@/lib/prisma";
import { sendMatchNotification } from "@/lib/whatsapp/send";
import { getPublicAppUrl } from "@/lib/microsite/app-url";

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
    ? await prisma.comercial.findFirst({
        where: { nombre: agentName, activo: true },
        select: { id: true, telefono: true, nombre: true },
      })
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
    const appUrl = getPublicAppUrl();
    const enlace = `${appUrl}/matching/cruces`;
    const nombre = demand?.nombre ?? "comprador";

    try {
      await sendMatchNotification(buyerPhone, {
        nombre,
        enlacePropiedad: enlace,
      });
      console.log(
        `[consumer:match] WhatsApp match enviado a comprador ${buyerPhone} (demanda=${demandId})`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[consumer:match] Error enviando WA match a ${buyerPhone}: ${msg}`,
      );
    }
  } else {
    console.log(
      `[consumer:match] Sin teléfono de comprador para demanda=${demandId} — solo notificación al comercial`,
    );
  }

  return { success: true, followUpJobs };
}
