import type { JobType } from "@/app/generated/prisma/client";
import type { JobRecord } from "@/lib/job-queue/types";
import type { HandlerResult } from "./types";
import {
  sendLeadAssignedToCommercial,
  sendFollowUpToCommercial,
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
