/**
 * M6 — Handler de SELECCION_COMPRADOR.
 *
 * Persiste feedback individual del comprador sobre una propiedad del microsite
 * en MicrositeSelectionFeedback (idempotente por selectionId+propertyId).
 *
 * Avanza leadStatus a EN_SELECCION cuando el comprador expresa ME_INTERESA.
 * Si la NLU indica intención ME_ENCAJA, inicia automáticamente el flujo de
 * visita (idempotente: no crea sesión si ya existe una activa).
 *
 * No dispara actualización de demanda ni regeneración de microsite:
 * eso lo maneja DEMANDA_ACTUALIZADA (emitido por whatsapp-nlu-handler
 * cuando el NLU detecta variables de ajuste).
 */

import type { Event } from "@/types/domain";
import type { HandlerResult } from "./types";
import type { MicrositeSelectionDecision } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { updateDemandLeadStatus } from "@/lib/projections/update-lead-status";
import { initiateVisitScheduling } from "@/lib/visit-scheduling/orchestrator";
import { ComposioNotConnectedError } from "@/lib/visit-scheduling/types";
import { getActiveSessionForBuyer } from "@/lib/visit-scheduling/session-manager";

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
      payload: (p as unknown as import("@/app/generated/prisma/client").Prisma.InputJsonValue) ?? {},
    },
    update: {
      decision,
      payload: (p as unknown as import("@/app/generated/prisma/client").Prisma.InputJsonValue) ?? {},
    },
  });

  if (decision === "ME_INTERESA") {
    await updateDemandLeadStatus(demandId, "EN_SELECCION");
  }

  // --- Inicio automático de visita cuando NLU indica ME_ENCAJA ---

  const nluIntention = p.nlu?.intention;
  const buyerWaId = p.source?.waId;

  if (
    decision === "ME_INTERESA" &&
    nluIntention === "ME_ENCAJA" &&
    buyerWaId &&
    propertyId
  ) {
    const existingSession = await getActiveSessionForBuyer(buyerWaId, propertyId);

    if (!existingSession) {
      try {
        const session = await initiateVisitScheduling(
          demandId,
          propertyId,
          buyerWaId,
          event.correlationId ?? undefined,
        );

        if (session) {
          console.log(
            `[consumer:seleccion] Visita iniciada automáticamente sessionId=${session.id} demandId=${demandId} propertyId=${propertyId}`,
          );
        } else {
          console.warn(
            `[consumer:seleccion] initiateVisitScheduling retornó null — comercial sin configurar para propertyId=${propertyId}`,
          );
        }
      } catch (err) {
        if (err instanceof ComposioNotConnectedError) {
          console.warn(
            `[consumer:seleccion] Visita no iniciada — comercial sin calendario (Composio) para propertyId=${propertyId}`,
          );
        } else {
          console.error(
            `[consumer:seleccion] Error iniciando visita para propertyId=${propertyId}: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
    }
  }

  const channel = p.source?.channel ?? "unknown";
  console.log(
    `[consumer:seleccion] SELECCION_COMPRADOR demandId=${demandId} property=${propertyId} decision=${decision} channel=${channel}`,
  );

  return { success: true };
}
