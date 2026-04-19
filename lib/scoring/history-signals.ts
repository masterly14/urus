import { prisma } from "@/lib/prisma";
import type { HistorySignals } from "./types";

/**
 * Fetches per-lead interaction history to enrich scoring signals.
 *
 * Looks up:
 * - WhatsApp conversation turn count (engagement)
 * - Best visit evaluation interest level (commitment)
 * - Microsite selections with ME_INTERESA (value signal)
 *
 * Returns null-safe defaults when no data exists.
 */
export async function fetchLeadHistorySignals(
  waId: string | null,
  demandId: string | null,
): Promise<HistorySignals> {
  const empty: HistorySignals = {
    whatsappTurnCount: 0,
    visitaInteres: null,
    micrositeInteresCount: 0,
  };

  if (!waId && !demandId) return empty;

  const [session, visitEval, feedbackCount] = await Promise.all([
    waId
      ? prisma.whatsAppBuyerSession.findUnique({
          where: { waId },
          select: { turnCount: true, selectionId: true },
        })
      : null,

    demandId
      ? prisma.commercialVisitEvaluationFact.findFirst({
          where: { demandId },
          orderBy: { createdAt: "desc" },
          select: { interes: true },
        })
      : null,

    demandId
      ? prisma.micrositeSelectionFeedback.count({
          where: {
            decision: "ME_INTERESA",
            selection: { demandId },
          },
        })
      : 0,
  ]);

  const interes = visitEval?.interes ?? null;
  const normalizedInteres =
    interes === "alto" || interes === "medio" || interes === "bajo"
      ? interes
      : null;

  return {
    whatsappTurnCount: session?.turnCount ?? 0,
    visitaInteres: normalizedInteres,
    micrositeInteresCount: feedbackCount ?? 0,
  };
}
