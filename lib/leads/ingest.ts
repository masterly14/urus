import { randomUUID } from "crypto";
import { appendEvent } from "@/lib/event-store";
import type { JsonValue } from "@/lib/event-store/types";
import { enqueueJob } from "@/lib/job-queue";
import type { LeadIngestPayload, EmitLeadResult } from "./types";

/**
 * Emite un evento LEAD_INGESTADO y encola un job PROCESS_EVENT.
 * Punto de entrada para todo lead nuevo — ya sea vía API, worker de ingesta, o webhook.
 */
export async function emitLeadIngestado(
  payload: LeadIngestPayload,
): Promise<EmitLeadResult> {
  const aggregateId = `lead-${randomUUID().slice(0, 12)}`;

  const event = await appendEvent({
    type: "LEAD_INGESTADO",
    aggregateType: "LEAD",
    aggregateId,
    payload: payload as unknown as JsonValue,
  });

  await enqueueJob({
    type: "PROCESS_EVENT",
    payload: { eventId: event.id },
    sourceEventId: event.id,
    idempotencyKey: `process_event:${event.id}`,
  });

  return { eventId: event.id, aggregateId };
}
