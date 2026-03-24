import { appendEvent } from "@/lib/event-store/event-store";
import { enqueueJob } from "@/lib/job-queue";
import type { EventRecord } from "@/lib/event-store/types";
import type { JobRecord } from "@/lib/job-queue/types";
import type { ContractIncompleteValidationSignal } from "./arras-payload";

export interface EmitIncompleteResult {
  event: EventRecord;
  job: JobRecord;
}

/**
 * Persiste el evento DATOS_INCOMPLETOS en el Event Store y encola
 * un job NOTIFY_CONTRACT_DATA_INCOMPLETE para notificar al comercial.
 *
 * Debe llamarse cuando `BuildArrasPayloadResult.ok === false`.
 */
export async function emitContractDataIncomplete(
  signal: ContractIncompleteValidationSignal,
): Promise<EmitIncompleteResult> {
  const { event: eventPayload, commercialTask } = signal;

  const event = await appendEvent({
    type: "DATOS_INCOMPLETOS",
    aggregateType: "DEMAND",
    aggregateId: eventPayload.demandId,
    payload: {
      operationId: eventPayload.operationId,
      propertyCode: eventPayload.propertyCode,
      documentKind: eventPayload.documentKind,
      missingRequiredCategories: eventPayload.missingRequiredCategories,
      issueCount: eventPayload.issues.length,
      issues: eventPayload.issues.map((i) => ({
        fieldPath: i.fieldPath,
        message: i.message,
      })),
    },
  });

  const job = await enqueueJob({
    type: "NOTIFY_CONTRACT_DATA_INCOMPLETE",
    payload: {
      demandId: commercialTask.demandId,
      propertyCode: commercialTask.propertyCode,
      operationId: commercialTask.operationId,
      assignedCommercialId: commercialTask.assignedCommercialId,
      title: commercialTask.title,
      description: commercialTask.description,
      missingRequiredCategories: commercialTask.missingRequiredCategories,
    },
    priority: 20,
    sourceEventId: event.id,
    idempotencyKey: `contract_incomplete:${eventPayload.operationId}:${eventPayload.demandId}`,
  });

  console.log(
    `[contracts] DATOS_INCOMPLETOS emitido eventId=${event.id} demandId=${eventPayload.demandId} operationId=${eventPayload.operationId} → job ${job.id}`,
  );

  return { event, job };
}
