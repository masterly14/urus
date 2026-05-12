import type { Event } from "@/types/domain";
import type { HandlerResult } from "./types";
import { startNluInitialContactForDemand } from "@/lib/nlu/initial-contact";

export async function handleDemandaCreadaNluInitialContact(
  event: Event,
): Promise<HandlerResult> {
  const result = await startNluInitialContactForDemand({
    demandId: event.aggregateId,
    source: "auto_demand_creada",
    causationId: event.id,
    correlationId: event.correlationId ?? null,
  });

  console.log(
    `[consumer:nlu-initial] demandId=${event.aggregateId} sent=${result.sent} skipped=${result.skippedReason ?? "none"}`,
  );

  return { success: true };
}
