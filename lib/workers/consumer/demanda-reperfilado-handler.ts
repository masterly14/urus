import type { Event } from "@/types/domain";
import type { HandlerResult } from "./types";
import { prisma } from "@/lib/prisma";
import { sendTextMessage } from "@/lib/whatsapp/send";

type ReperfiladoPayload = {
  visitWorkItemId?: string;
  propertyId?: string;
  reason?: string;
  notes?: string;
  propertySnapshot?: {
    title?: string;
  };
  nluSummary?: string;
};

export async function handleDemandaReperfiladoSolicitado(event: Event): Promise<HandlerResult> {
  const demandId = event.aggregateId;
  const payload = (event.payload ?? {}) as ReperfiladoPayload;
  const demand = await prisma.demandCurrent.findUnique({
    where: { codigo: demandId },
    select: { telefono: true, nombre: true },
  });

  if (!demand?.telefono) {
    console.warn(`[consumer:reperfilado] demandId=${demandId} sin telefono comprador`);
    return { success: true };
  }

  const propertyTitle = payload.propertySnapshot?.title || payload.propertyId || "la propiedad visitada";
  const reasonText = payload.reason || payload.notes;
  const body = [
    `Gracias por visitar ${propertyTitle}.`,
    reasonText ? `He anotado: ${reasonText}.` : null,
    "Para afinar mejor la busqueda: que fue lo que no te encajo y que tendria que tener la siguiente vivienda para que si te interese?",
  ].filter((line): line is string => Boolean(line)).join("\n\n");

  await prisma.whatsAppBuyerSession.upsert({
    where: { waId: demand.telefono },
    create: {
      waId: demand.telefono,
      demandId,
      lastMessageAt: new Date(),
      turnCount: 0,
      summary: payload.nluSummary ?? null,
      conversationPhase: "reperfilado_post_visita",
      buyerDigest: reasonText ?? null,
    },
    update: {
      demandId,
      lastMessageAt: new Date(),
      conversationPhase: "reperfilado_post_visita",
      buyerDigest: reasonText ?? undefined,
      summary: payload.nluSummary ?? undefined,
    },
  });

  await sendTextMessage(demand.telefono, body, {
    trace: {
      source: "visitas",
      kind: "demanda_reperfilado_post_visita",
      aggregateId: demand.telefono,
      correlationId: event.correlationId ?? null,
      causationId: event.id,
      payload: {
        demandId,
        visitWorkItemId: payload.visitWorkItemId,
        propertyId: payload.propertyId,
      },
    },
  });

  return { success: true };
}
