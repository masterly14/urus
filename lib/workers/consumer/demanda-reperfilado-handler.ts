import type { Event } from "@/types/domain";
import type { Prisma } from "@prisma/client";
import type { HandlerResult } from "./types";
import { prisma } from "@/lib/prisma";
import { sendTextMessage } from "@/lib/whatsapp/send";
import { normalizePostVisitContext } from "@/lib/visitas/post-visit-context-normalizer";
import {
  POST_VISIT_AUTO_UPDATE_CONFIDENCE_THRESHOLD,
  POST_VISIT_POLICY_VERSION,
  type PostVisitPolicyState,
  type PostVisitStructuredContext,
} from "@/lib/visitas/post-visit-context-types";

type ReperfiladoPayload = {
  visitWorkItemId?: string;
  propertyId?: string;
  reason?: string;
  notes?: string;
  postVisitContext?: string;
  postVisitContextStructured?: PostVisitStructuredContext | null;
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
  const postVisitContext = payload.postVisitContext?.trim();
  const structuredContext =
    payload.postVisitContextStructured ??
    (postVisitContext ? normalizePostVisitContext(postVisitContext) : null);
  const contextForPrompt = structuredContext?.summary || (postVisitContext ? postVisitContext.slice(0, 500) : null);
  const buyerDigest = postVisitContext
    ? `Contexto post-visita del comercial: ${postVisitContext}`
    : reasonText ?? null;
  const policyState: PostVisitPolicyState = {
    mode: "hybrid",
    threshold: POST_VISIT_AUTO_UPDATE_CONFIDENCE_THRESHOLD,
    ruleApplied: "requires_buyer_confirmation",
    conflictResolvedBy: "buyer_priority",
    pendingConfirmationFields: structuredContext?.requiresBuyerConfirmation ?? [],
    autoPromotableVariables: structuredContext?.autoPromotableVariables ?? {},
    lastEvaluatedAt: new Date().toISOString(),
    policyVersion: POST_VISIT_POLICY_VERSION,
  };
  const body = [
    `Gracias por visitar ${propertyTitle}.`,
    reasonText ? `He anotado: ${reasonText}.` : null,
    contextForPrompt
      ? `Me comentan este contexto: "${contextForPrompt}". ¿Lo he entendido bien?`
      : null,
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
      buyerDigest,
      postVisitContextStructured: structuredContext ? structuredContext as unknown as Prisma.InputJsonValue : undefined,
      postVisitPolicyState: structuredContext ? policyState as unknown as Prisma.InputJsonValue : undefined,
    },
    update: {
      demandId,
      lastMessageAt: new Date(),
      conversationPhase: "reperfilado_post_visita",
      buyerDigest: buyerDigest ?? undefined,
      summary: payload.nluSummary ?? undefined,
      postVisitContextStructured: structuredContext ? structuredContext as unknown as Prisma.InputJsonValue : undefined,
      postVisitPolicyState: structuredContext ? policyState as unknown as Prisma.InputJsonValue : undefined,
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
        postVisitContextStructured: structuredContext,
      },
    },
  });

  return { success: true };
}
