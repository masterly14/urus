/**
 * M6 — Handler de SELECCION_COMPRADOR.
 *
 * Persiste feedback individual del comprador sobre una propiedad del microsite
 * en MicrositeSelectionFeedback (idempotente por selectionId+propertyId).
 *
 * Avanza leadStatus a VISITA_PENDIENTE cuando el comprador expresa ME_INTERESA
 * y notifica al comercial para que coordine la visita con propietario/agencia.
 *
 * No dispara actualización de demanda ni regeneración de microsite:
 * eso lo maneja DEMANDA_ACTUALIZADA (emitido por whatsapp-nlu-handler
 * cuando el NLU detecta variables de ajuste).
 */

import type { Event } from "@/types/domain";
import type { HandlerResult } from "./types";
import type { MicrositeSelectionDecision } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { updateDemandLeadStatus } from "@/lib/projections/update-lead-status";
import { notifyCommercialVisitInterest } from "@/lib/visitas/notify-commercial";
import { enqueueJob } from "@/lib/job-queue";
import type { JobType } from "@prisma/client";

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
      payload: (p as unknown as import("@prisma/client").Prisma.InputJsonValue) ?? {},
    },
    update: {
      decision,
      payload: (p as unknown as import("@prisma/client").Prisma.InputJsonValue) ?? {},
    },
  });

  const channel = p.source?.channel ?? "unknown";

  if (decision === "ME_INTERESA") {
    await updateDemandLeadStatus(demandId, "VISITA_PENDIENTE");
    const notification = await notifyCommercialVisitInterest({
      demandId,
      propertyIds: [propertyId],
      causationId: event.id,
      correlationId: event.correlationId ?? null,
    });
    if (!notification.sent) {
      console.warn(
        `[consumer:seleccion] No se notificó paquete de visita demandId=${demandId}: ${notification.reason ?? "unknown"}`,
      );
    }

    // Acuse al comprador SOLO cuando el interés llega por el botón
    // "Me encaja" del micrositio (canal canónico). Si el evento procede de
    // otros canales (p.ej. NLU sobre WhatsApp), no se envía acuse para no
    // romper la regla de "un mensaje por click".
    if (channel === "microsite_card") {
      try {
        await enqueueJob({
          type: "SEND_BUYER_INTEREST_ACK" as JobType,
          payload: {
            selectionId,
            propertyId,
            demandId,
            sourceEventId: event.id,
          },
          sourceEventId: event.id,
          idempotencyKey: `send_buyer_interest_ack:${event.id}`,
          priority: 30,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `[consumer:seleccion] No se pudo encolar SEND_BUYER_INTEREST_ACK demandId=${demandId} selection=${selectionId} property=${propertyId}: ${msg}`,
        );
      }
    }
  }

  console.log(
    `[consumer:seleccion] SELECCION_COMPRADOR demandId=${demandId} property=${propertyId} decision=${decision} channel=${channel}`,
  );

  return { success: true };
}
