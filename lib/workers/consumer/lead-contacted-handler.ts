import type { Event } from "@/types/domain";
import type { HandlerResult } from "./types";
import { upsertCommercialLeadFactFromLeadContactedEvent } from "@/lib/dashboard/comercial/facts";

export async function handleLeadContactado(event: Event): Promise<HandlerResult> {
  try {
    await upsertCommercialLeadFactFromLeadContactedEvent(event);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[analytics] No se pudo registrar LEAD_CONTACTADO en CommercialLeadFact leadId=${event.aggregateId}: ${message}`,
    );
  }

  return { success: true };
}

