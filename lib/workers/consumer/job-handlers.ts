import type { JobType } from "@/app/generated/prisma/client";
import type { JobRecord } from "@/lib/job-queue/types";
import type { HandlerResult } from "./types";
import {
  sendLeadAssignedToCommercial,
  sendFollowUpToCommercial,
  sendMicrositePendingValidationToCommercial,
  sendMicrositeLinkToBuyer,
  sendContractDataIncompleteToCommercial,
  type LeadAssignedParams,
  type FollowUpParams,
} from "@/lib/whatsapp/send";
import {
  checkLeadNeedsFollowUp,
  type FollowUpCheckResult,
} from "@/lib/leads/follow-up-checker";
import { prisma } from "@/lib/prisma";
import {
  writeToInmovilla,
  InmovillaWriteError,
  type WriteOperation,
  type WriteOperationPayloadMap,
} from "@/lib/inmovilla/write";
import { generateMicrositeSelection } from "@/lib/microsite/selection";
import { getPublicAppUrl } from "@/lib/microsite/app-url";
import { normalizeWhatsAppDigits } from "@/lib/microsite/buyer-phone";
import { enqueueJob } from "@/lib/job-queue";
import type { DemandFilterInput } from "@/lib/statefox";

export type JobHandler = (job: JobRecord) => Promise<HandlerResult>;

const jobRegistry = new Map<JobType, JobHandler>();

export function registerJobHandler(type: JobType, handler: JobHandler): void {
  jobRegistry.set(type, handler);
}

export function getJobHandler(type: JobType): JobHandler | undefined {
  return jobRegistry.get(type);
}

async function handleNotifyLeadWhatsApp(job: JobRecord): Promise<HandlerResult> {
  const payload = (job.payload ?? {}) as Record<string, unknown>;

  const telefono = payload.assignedAgentTelefono;
  if (!telefono || typeof telefono !== "string") {
    console.log(
      `[consumer] NOTIFY_LEAD_WHATSAPP job ${job.id} sin teléfono de agente — completando sin envío`,
    );
    return { success: true };
  }

  const params: LeadAssignedParams = {
    leadId: String(payload.leadAggregateId ?? ""),
    score: typeof payload.score === "number" ? payload.score : 0,
    slaLevel: typeof payload.slaLevel === "string" ? payload.slaLevel : "UNKNOWN",
    maxResponseMs:
      typeof payload.maxResponseMs === "number" ? payload.maxResponseMs : undefined,
    ciudad: typeof payload.ciudad === "string" ? payload.ciudad : undefined,
    reasons: Array.isArray(payload.reasons) ? payload.reasons as string[] : undefined,
  };

  await sendLeadAssignedToCommercial(telefono, params);

  console.log(
    `[consumer] NOTIFY_LEAD_WHATSAPP job ${job.id} enviado a ${telefono} (lead=${params.leadId} score=${params.score})`,
  );

  return { success: true };
}

registerJobHandler("NOTIFY_LEAD_WHATSAPP", handleNotifyLeadWhatsApp);

const PERMANENT_ERROR_CODES = new Set<string>([
  "VALIDATION_ERROR",
]);

const TRANSIENT_ERROR_CODES = new Set<string>([
  "SESSION_EXPIRED",
  "NETWORK_ERROR",
]);

function isErrorPermanent(err: unknown): boolean {
  if (err instanceof InmovillaWriteError) {
    return PERMANENT_ERROR_CODES.has(err.code);
  }
  return false;
}

async function handleWriteToInmovilla(job: JobRecord): Promise<HandlerResult> {
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const operation = payload.operation as WriteOperation | undefined;
  const args = payload.args as unknown;

  if (!operation) {
    return {
      success: false,
      error: "WRITE_TO_INMOVILLA sin payload.operation",
      permanent: true,
    };
  }

  try {
    await writeToInmovilla(
      operation,
      args as WriteOperationPayloadMap[WriteOperation],
      {
        headless: true,
        retryOnSessionExpired: true,
        verify: true,
      },
    );

    console.log(
      `[consumer] WRITE_TO_INMOVILLA job ${job.id} operación=${operation} — OK`,
    );
    return { success: true };
  } catch (err) {
    const permanent = isErrorPermanent(err);

    if (err instanceof InmovillaWriteError) {
      const message = `${err.code}: ${err.message}`;
      const retryLabel = permanent ? "NO RETRIABLE" : "retriable";
      console.error(
        `[consumer] WRITE_TO_INMOVILLA job ${job.id} operación=${operation} — ${message} [${retryLabel}]`,
      );
      return { success: false, error: message, permanent };
    }

    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[consumer] WRITE_TO_INMOVILLA job ${job.id} operación=${operation} — error inesperado: ${message}`,
    );
    return { success: false, error: message };
  }
}

registerJobHandler("WRITE_TO_INMOVILLA", handleWriteToInmovilla);

export type FollowUpChecker = (aggregateId: string) => Promise<FollowUpCheckResult>;
export type AgentPhoneLookup = (agentId: string) => Promise<string | null>;

async function lookupAgentPhone(agentId: string): Promise<string | null> {
  const agent = await prisma.comercial.findUnique({
    where: { id: agentId },
    select: { telefono: true },
  });
  return agent?.telefono || null;
}

/**
 * Procesa un job FOLLOW_UP_LEAD:
 * 1. Verifica si el lead sigue sin contactar (consulta Event Store).
 * 2. Si ya fue contactado → completa sin envío.
 * 3. Si sigue sin respuesta → busca teléfono del comercial → envía recordatorio.
 */
export async function handleFollowUpLead(
  job: JobRecord,
  deps?: { checker?: FollowUpChecker; phoneLookup?: AgentPhoneLookup },
): Promise<HandlerResult> {
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const leadAggregateId = String(payload.leadAggregateId ?? "");
  const step = String(payload.step ?? "");
  const score = typeof payload.score === "number" ? payload.score : 0;
  const assignedAgentId =
    typeof payload.assignedAgentId === "string" ? payload.assignedAgentId : null;

  if (!leadAggregateId) {
    console.error(`[consumer] FOLLOW_UP_LEAD job ${job.id} sin leadAggregateId`);
    return { success: false, error: "Job FOLLOW_UP_LEAD sin leadAggregateId" };
  }

  const checker = deps?.checker ?? checkLeadNeedsFollowUp;
  const checkResult = await checker(leadAggregateId);

  if (!checkResult.shouldFollowUp) {
    console.log(
      `[consumer] FOLLOW_UP_LEAD ${step} job ${job.id} — omitido: ${checkResult.reason}`,
    );
    return { success: true };
  }

  if (!assignedAgentId) {
    console.log(
      `[consumer] FOLLOW_UP_LEAD ${step} job ${job.id} — sin agente asignado, completando`,
    );
    return { success: true };
  }

  const phoneLookup = deps?.phoneLookup ?? lookupAgentPhone;
  const telefono = await phoneLookup(assignedAgentId);

  if (!telefono) {
    console.log(
      `[consumer] FOLLOW_UP_LEAD ${step} job ${job.id} — agente ${assignedAgentId} sin teléfono`,
    );
    return { success: true };
  }

  const params: FollowUpParams = {
    leadId: leadAggregateId,
    step,
    score,
  };

  await sendFollowUpToCommercial(telefono, params);

  console.log(
    `[consumer] FOLLOW_UP_LEAD ${step} job ${job.id} — recordatorio enviado a ${telefono} (lead=${leadAggregateId})`,
  );

  return { success: true };
}

registerJobHandler("FOLLOW_UP_LEAD", handleFollowUpLead);

async function handleGenerateMicrosite(job: JobRecord): Promise<HandlerResult> {
  const payload = (job.payload ?? {}) as Record<string, unknown>;

  const demandId = typeof payload.demandId === "string" ? payload.demandId : "";
  if (!demandId) {
    return { success: false, error: "GENERATE_MICROSITE sin payload.demandId", permanent: true };
  }

  const comercialId = typeof payload.comercialId === "string" ? payload.comercialId : "system";
  const sourceEventId =
    typeof payload.sourceEventId === "string"
      ? payload.sourceEventId
      : job.sourceEventId ?? undefined;

  const demandFromPayload = payload.demand as unknown as Partial<DemandFilterInput> | undefined;

  const demandCurrent = await prisma.demandCurrent.findUnique({
    where: { codigo: demandId },
    select: {
      nombre: true,
      tipos: true,
      zonas: true,
      presupuestoMin: true,
      presupuestoMax: true,
      habitacionesMin: true,
    },
  });

  const demand: DemandFilterInput = {
    tipos: demandCurrent?.tipos ?? String(demandFromPayload?.tipos ?? ""),
    zonas: demandCurrent?.zonas ?? String(demandFromPayload?.zonas ?? ""),
    presupuestoMin:
      demandCurrent?.presupuestoMin ??
      (typeof demandFromPayload?.presupuestoMin === "number" ? demandFromPayload.presupuestoMin : 0),
    presupuestoMax:
      demandCurrent?.presupuestoMax ??
      (typeof demandFromPayload?.presupuestoMax === "number" ? demandFromPayload.presupuestoMax : 0),
    habitacionesMin:
      demandCurrent?.habitacionesMin ??
      (typeof demandFromPayload?.habitacionesMin === "number" ? demandFromPayload.habitacionesMin : 0),
    metrosMin:
      typeof demandFromPayload?.metrosMin === "number" ? demandFromPayload.metrosMin : undefined,
    metrosMax:
      typeof demandFromPayload?.metrosMax === "number" ? demandFromPayload.metrosMax : undefined,
  };

  const demandNombre = demandCurrent?.nombre ?? "";

  const result = await generateMicrositeSelection({
    demandId,
    demandNombre,
    comercialId,
    demand,
    sourceEventId,
  });

  if (!result.ok) {
    console.warn(
      `[consumer] GENERATE_MICROSITE job ${job.id} demandId=${demandId} — omitido: ${result.reason}`,
    );
    return { success: true };
  }

  console.log(
    `[consumer] GENERATE_MICROSITE job ${job.id} demandId=${demandId} — creado Token=${result.token} props=${result.propertiesCount} stock=${result.stockCount}`,
  );

  await enqueueJob({
    type: "NOTIFY_MICROSITE_PENDING_VALIDATION",
    payload: { selectionId: result.selectionId },
    priority: 40,
    idempotencyKey: `notify_microsite_validation:${result.selectionId}`,
  });

  return { success: true };
}

registerJobHandler("GENERATE_MICROSITE", handleGenerateMicrosite);

async function handleNotifyMicrositePendingValidation(job: JobRecord): Promise<HandlerResult> {
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const selectionId = typeof payload.selectionId === "string" ? payload.selectionId : "";
  if (!selectionId) {
    return { success: false, error: "NOTIFY_MICROSITE_PENDING_VALIDATION sin selectionId", permanent: true };
  }

  const selection = await prisma.micrositeSelection.findUnique({
    where: { id: selectionId },
    select: {
      status: true,
      validationToken: true,
      demandId: true,
      demandNombre: true,
      comercialId: true,
      validationDueAt: true,
    },
  });

  if (!selection) {
    return { success: false, error: "Selección no encontrada", permanent: true };
  }
  if (selection.status !== "PENDING_VALIDATION") {
    console.log(
      `[consumer] NOTIFY_MICROSITE_PENDING_VALIDATION job ${job.id} — omitido, status=${selection.status}`,
    );
    return { success: true };
  }

  const comercial = await prisma.comercial.findUnique({
    where: { id: selection.comercialId },
    select: { telefono: true },
  });
  const telefono = comercial?.telefono?.trim();
  if (!telefono) {
    console.warn(
      `[consumer] NOTIFY_MICROSITE_PENDING_VALIDATION job ${job.id} — comercial ${selection.comercialId} sin teléfono`,
    );
    return { success: true };
  }

  const base = getPublicAppUrl();
  const validationUrl = `${base}/validar-seleccion/${selection.validationToken}`;
  const due = selection.validationDueAt ?? new Date(Date.now() + 2 * 60 * 60 * 1000);

  try {
    await sendMicrositePendingValidationToCommercial(telefono, {
      demandId: selection.demandId,
      demandNombre: selection.demandNombre,
      validationUrl,
      validationDueAtIso: due.toISOString(),
    });
    console.log(
      `[consumer] NOTIFY_MICROSITE_PENDING_VALIDATION job ${job.id} — enviado a ${telefono} selectionId=${selectionId}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[consumer] NOTIFY_MICROSITE_PENDING_VALIDATION — error: ${message}`);
    return { success: false, error: message };
  }

  return { success: true };
}

registerJobHandler("NOTIFY_MICROSITE_PENDING_VALIDATION", handleNotifyMicrositePendingValidation);

async function handleSendMicrositeToBuyer(job: JobRecord): Promise<HandlerResult> {
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const selectionId = typeof payload.selectionId === "string" ? payload.selectionId : "";
  if (!selectionId) {
    return { success: false, error: "SEND_MICROSITE_TO_BUYER sin selectionId", permanent: true };
  }

  const selection = await prisma.micrositeSelection.findUnique({
    where: { id: selectionId },
    select: {
      token: true,
      status: true,
      demandNombre: true,
      buyerPhone: true,
    },
  });

  if (!selection) {
    return { success: false, error: "Selección no encontrada", permanent: true };
  }
  if (selection.status !== "APPROVED") {
    console.warn(
      `[consumer] SEND_MICROSITE_TO_BUYER job ${job.id} — status=${selection.status}, omitiendo envío`,
    );
    return { success: true };
  }

  const digits = normalizeWhatsAppDigits(selection.buyerPhone);
  if (digits.length < 9) {
    console.warn(
      `[consumer] SEND_MICROSITE_TO_BUYER job ${job.id} — sin teléfono comprador para selectionId=${selectionId}`,
    );
    return { success: true };
  }

  const base = getPublicAppUrl();
  const buyerUrl = `${base}/seleccion/${selection.token}`;

  try {
    await sendMicrositeLinkToBuyer(digits, {
      demandNombre: selection.demandNombre,
      buyerUrl,
    });
    console.log(
      `[consumer] SEND_MICROSITE_TO_BUYER job ${job.id} — enviado al comprador selectionId=${selectionId}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[consumer] SEND_MICROSITE_TO_BUYER — error: ${message}`);
    return { success: false, error: message };
  }

  return { success: true };
}

registerJobHandler("SEND_MICROSITE_TO_BUYER", handleSendMicrositeToBuyer);

async function handleNotifyContractDataIncomplete(job: JobRecord): Promise<HandlerResult> {
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const operationId = typeof payload.operationId === "string" ? payload.operationId : "";
  const demandId = typeof payload.demandId === "string" ? payload.demandId : "";
  const assignedCommercialId =
    typeof payload.assignedCommercialId === "string" ? payload.assignedCommercialId : "";
  const description = typeof payload.description === "string" ? payload.description : "";
  const missingCategories = Array.isArray(payload.missingRequiredCategories)
    ? (payload.missingRequiredCategories as string[])
    : [];

  if (!operationId || !demandId) {
    return {
      success: false,
      error: "NOTIFY_CONTRACT_DATA_INCOMPLETE sin operationId o demandId",
      permanent: true,
    };
  }

  if (!assignedCommercialId || assignedCommercialId === "system") {
    console.warn(
      `[consumer] NOTIFY_CONTRACT_DATA_INCOMPLETE job ${job.id} — sin comercial asignado, completando sin envío`,
    );
    return { success: true };
  }

  const comercial = await prisma.comercial.findUnique({
    where: { id: assignedCommercialId },
    select: { telefono: true },
  });
  const telefono = comercial?.telefono?.trim();

  if (!telefono) {
    console.warn(
      `[consumer] NOTIFY_CONTRACT_DATA_INCOMPLETE job ${job.id} — comercial ${assignedCommercialId} sin teléfono`,
    );
    return { success: true };
  }

  try {
    await sendContractDataIncompleteToCommercial(telefono, {
      operationId,
      demandId,
      missingCategories,
      description,
    });
    console.log(
      `[consumer] NOTIFY_CONTRACT_DATA_INCOMPLETE job ${job.id} — enviado a ${telefono} operationId=${operationId}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[consumer] NOTIFY_CONTRACT_DATA_INCOMPLETE — error: ${message}`);
    return { success: false, error: message };
  }

  return { success: true };
}

registerJobHandler("NOTIFY_CONTRACT_DATA_INCOMPLETE", handleNotifyContractDataIncomplete);
