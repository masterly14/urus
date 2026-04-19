import type { Event } from "@/types/domain";
import type { HandlerResult } from "./types";
import { upsertCommercialVisitFactFromVisitaAgendadaEvent } from "@/lib/dashboard/comercial/facts";

export async function handleVisitaAgendada(event: Event): Promise<HandlerResult> {
  try {
    await upsertCommercialVisitFactFromVisitaAgendadaEvent(event);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[analytics] No se pudo registrar VISITA_AGENDADA en CommercialVisitFact demandId=${event.aggregateId}: ${message}`,
    );
  }

  return { success: true };
}

