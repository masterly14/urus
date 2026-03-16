import { prisma } from "@/lib/prisma";

export interface FollowUpCheckResult {
  shouldFollowUp: boolean;
  reason: string;
}

/**
 * Determina si un lead sigue "sin respuesta" y merece follow-up.
 *
 * Un lead se considera contactado si existe al menos un evento
 * LEAD_CONTACTADO en su historial de aggregate.
 *
 * Inyectable: acepta un fetcher para testabilidad.
 */
export async function checkLeadNeedsFollowUp(
  leadAggregateId: string,
  fetchContactEvents?: (aggregateId: string) => Promise<{ count: number }>,
): Promise<FollowUpCheckResult> {
  const fetcher = fetchContactEvents ?? countContactEvents;
  const { count } = await fetcher(leadAggregateId);

  if (count > 0) {
    return {
      shouldFollowUp: false,
      reason: `Lead ya contactado (${count} evento(s) LEAD_CONTACTADO)`,
    };
  }

  return {
    shouldFollowUp: true,
    reason: "Sin eventos LEAD_CONTACTADO — lead sin respuesta",
  };
}

async function countContactEvents(
  aggregateId: string,
): Promise<{ count: number }> {
  const count = await prisma.event.count({
    where: {
      aggregateType: "LEAD",
      aggregateId,
      type: "LEAD_CONTACTADO",
    },
  });
  return { count };
}

/**
 * Emite un evento LEAD_CONTACTADO para marcar un lead como contactado.
 * Usado por el comercial (vía micro-frontend, API, o webhook de WhatsApp).
 */
export async function markLeadAsContacted(
  aggregateId: string,
  metadata?: { comercialId?: string; canal?: string },
): Promise<string> {
  const { appendEvent } = await import("@/lib/event-store");

  const event = await appendEvent({
    type: "LEAD_CONTACTADO",
    aggregateType: "LEAD",
    aggregateId,
    payload: {
      contactedAt: new Date().toISOString(),
      ...metadata,
    },
  });

  return event.id;
}
