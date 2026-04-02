/**
 * M6 — Handler de SELECCION_COMPRADOR.
 *
 * Reacciona al feedback del comprador sobre una propiedad del microsite.
 * Persiste el feedback en MicrositeSelectionFeedback (idempotente) y,
 * si la decisión es NO_ME_ENCAJA, encola la actualización de proyección.
 */

import type { Event } from "@/types/domain";
import type { HandlerResult } from "./types";
import type { EnqueueJobInput } from "@/lib/job-queue/types";
import type { MicrositeSelectionDecision } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type SeleccionCompradorPayload = {
  demandId?: string;
  selectionId?: string;
  propertyId?: string;
  decision?: string;
  source?: {
    channel?: string;
    waId?: string;
    messageId?: string;
    eventId?: string;
  };
  nlu?: {
    intention?: string;
    confidence?: number;
    reasoning?: string;
  };
  respondedAt?: string;
};

function isValidDecision(v: unknown): v is MicrositeSelectionDecision {
  return v === "ME_INTERESA" || v === "NO_ME_ENCAJA";
}

export async function handleSeleccionComprador(event: Event): Promise<HandlerResult> {
  const p = (event.payload ?? {}) as SeleccionCompradorPayload;
  const demandId = event.aggregateId;
  const selectionId = p.selectionId;
  const propertyId = p.propertyId;
  const decision = p.decision;

  if (!selectionId || !propertyId || !isValidDecision(decision)) {
    console.log(
      `[consumer:seleccion] SELECCION_COMPRADOR demandId=${demandId} — payload incompleto (selectionId=${selectionId ?? "null"} propertyId=${propertyId ?? "null"} decision=${decision ?? "null"}) — skip`,
    );
    return { success: true };
  }

  await prisma.micrositeSelectionFeedback.upsert({
    where: {
      selectionId_propertyId: { selectionId, propertyId },
    },
    create: {
      selectionId,
      propertyId,
      decision,
      payload: (p as Record<string, unknown>) ?? {},
    },
    update: {
      decision,
      payload: (p as Record<string, unknown>) ?? {},
    },
  });

  const followUpJobs: EnqueueJobInput[] = [];

  if (decision === "NO_ME_ENCAJA") {
    followUpJobs.push({
      type: "UPDATE_DEMAND_PROJECTION",
      payload: { eventId: event.id },
      idempotencyKey: `update_demand_projection:${event.id}`,
      sourceEventId: event.id,
    });
  }

  const channel = p.source?.channel ?? "unknown";
  console.log(
    `[consumer:seleccion] SELECCION_COMPRADOR demandId=${demandId} property=${propertyId} decision=${decision} channel=${channel}`,
  );

  return { success: true, followUpJobs };
}
