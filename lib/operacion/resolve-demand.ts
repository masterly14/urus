import { prisma } from "@/lib/prisma";

/**
 * Resuelve el demandId más probable para una propiedad dada, consultando
 * fuentes de datos existentes en orden de confianza decreciente:
 *
 *   1. VisitSchedulingSession (el comprador visitó la propiedad)
 *   2. MicrositeSelectionFeedback con ME_INTERESA (interés explícito)
 *   3. Evento MATCH_GENERADO más reciente (cruce automático)
 *
 * Retorna null si no hay evidencia de vínculo demanda↔propiedad.
 */
export async function resolveDemandIdForProperty(
  propertyCode: string,
): Promise<string | null> {
  const visitSession = await prisma.visitSchedulingSession.findFirst({
    where: { propertyCode },
    orderBy: { updatedAt: "desc" },
    select: { demandId: true },
  });
  if (visitSession?.demandId) return visitSession.demandId;

  const feedback = await prisma.micrositeSelectionFeedback.findFirst({
    where: { propertyId: propertyCode, decision: "ME_INTERESA" },
    orderBy: { createdAt: "desc" },
    include: { selection: { select: { demandId: true } } },
  });
  if (feedback?.selection?.demandId) return feedback.selection.demandId;

  const matchEvent = await prisma.event.findFirst({
    where: {
      type: "MATCH_GENERADO",
      payload: { path: ["propertyId"], equals: propertyCode },
    },
    orderBy: { occurredAt: "desc" },
    select: { payload: true },
  });
  const matchPayload = matchEvent?.payload as { demandId?: string } | null;
  if (matchPayload?.demandId) return matchPayload.demandId;

  return null;
}
