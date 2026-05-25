import type { JobRecord, JsonValue } from "@/lib/job-queue/types";
import type { HandlerResult } from "./types";
import {
  registerJobHandler,
  getJobHandler,
  type JobHandler,
} from "./registry";

export { registerJobHandler, getJobHandler };
export type { JobHandler };

import { appendEvent } from "@/lib/event-store";
import { canExecute, recordSuccess, recordFailure } from "@/lib/circuit-breaker";
import {
  sendLeadAssignedToCommercial,
  sendFollowUpToCommercial,
  sendTextMessage,
  sendNoStockAvailableToBuyer,
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
import {
  generateMicrositeSelection,
  type GenerateMicrositeSelectionResult,
} from "@/lib/microsite/selection";
import { approveMicrositeByAI } from "@/lib/microsite/approve-by-ai";
import { getPublicAppUrl } from "@/lib/microsite/app-url";
import { normalizeWhatsAppDigits, resolveBuyerPhoneForDemand } from "@/lib/microsite/buyer-phone";
import { sendMicrositeToBuyerHot } from "@/lib/microsite/send-microsite-buyer-hot";
import { enqueueJob } from "@/lib/job-queue";
import type { DemandFilterInput } from "@/lib/statefox";
import { EXTERNAL_PORTFOLIO_DISABLED_REASON } from "@/lib/statefox/external-search";
import { alertGeneric } from "@/lib/alerts/alert-service";
import { handleGenerateContractDraft } from "./contract-draft-handler";
import {
  handleSendPostSaleMessage,
  handleSendReviewRequest,
  handleSendReviewReminder,
  handleSendReferralRequest,
} from "./post-sale-job-handler";

type MicrositeGenerationFailureReason = Extract<
  GenerateMicrositeSelectionResult,
  { ok: false }
>["reason"];

const MICROSITE_INFRA_FAILURE_REASONS = new Set<MicrositeGenerationFailureReason>([
  "EXTERNAL_SEARCH_DISABLED",
  "STATEFOX_TOKEN_MISSING",
  "STATEFOX_ERROR",
]);

function getPayloadString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value : null;
}

async function appendMicrositeGenerationResultEvent(args: {
  job: JobRecord;
  demandId: string;
  source: string | null;
  sourceEventId: string | undefined;
  notifyOnEmpty: boolean;
  status: "created" | "skipped";
  reason?: MicrositeGenerationFailureReason;
  selectionId?: string;
  selectionToken?: string;
  propertiesCount?: number;
  stockCount?: number;
  buyerWaId?: string | null;
}): Promise<void> {
  const existing = await prisma.event.findFirst({
    where: {
      type: "MICROSITE_GENERACION_RESULTADO",
      aggregateType: "DEMAND",
      aggregateId: args.demandId,
      payload: { path: ["jobId"], equals: args.job.id },
    },
    select: { id: true },
  });
  if (existing) return;

  await appendEvent({
    type: "MICROSITE_GENERACION_RESULTADO",
    aggregateType: "DEMAND",
    aggregateId: args.demandId,
    payload: {
      jobId: args.job.id,
      jobType: args.job.type,
      status: args.status,
      reason: args.reason ?? null,
      source: args.source,
      sourceEventId: args.sourceEventId ?? null,
      notifyOnEmpty: args.notifyOnEmpty,
      buyerWaId: args.buyerWaId ?? null,
      selectionId: args.selectionId ?? null,
      selectionToken: args.selectionToken ?? null,
      propertiesCount: args.propertiesCount ?? null,
      stockCount: args.stockCount ?? null,
      attempts: args.job.attempts,
    } as JsonValue,
    causationId: args.sourceEventId ?? args.job.sourceEventId ?? undefined,
  });
}

async function alertMicrositeGenerationFailure(args: {
  job: JobRecord;
  demandId: string;
  reason: MicrositeGenerationFailureReason;
  source: string | null;
  sourceEventId: string | undefined;
}): Promise<void> {
  if (!MICROSITE_INFRA_FAILURE_REASONS.has(args.reason)) return;

  await alertGeneric("Generación de microsite omitida", "warning", {
    jobId: args.job.id,
    jobType: args.job.type,
    demandId: args.demandId,
    reason: args.reason,
    source: args.source,
    sourceEventId: args.sourceEventId ?? null,
  });
}

async function notifyBuyerMicrositeGenerationDelayed(args: {
  job: JobRecord;
  demandId: string;
  demandNombre: string;
  reason: MicrositeGenerationFailureReason;
  sourceEventId: string | undefined;
}): Promise<string | null> {
  const buyerPhone = await resolveBuyerPhoneForDemand(args.demandId);
  if (!buyerPhone) {
    console.warn(
      `[consumer] GENERATE_MICROSITE job ${args.job.id} — ${args.reason} pero no hay teléfono para demandId=${args.demandId}; no se avisa al comprador`,
    );
    return null;
  }

  const alreadySent = await prisma.event.findFirst({
    where: {
      type: "WHATSAPP_ENVIADO",
      aggregateType: "WHATSAPP_CONVERSATION",
      aggregateId: buyerPhone,
      AND: [
        { payload: { path: ["kind"], equals: "microsite_generation_delayed" } },
        { payload: { path: ["jobId"], equals: args.job.id } },
      ],
    },
    select: { id: true },
  });
  if (alreadySent) return buyerPhone;

  const firstName = args.demandNombre.trim().split(/\s+/)[0];
  const greeting = `Hola${firstName ? ` ${firstName}` : ""},`;
  const body = [
    greeting,
    "",
    "Estoy afinando tu búsqueda, pero ahora mismo no he podido generar una selección fiable automáticamente.",
    "No quiero pasarte opciones que no encajen; lo dejo marcado para revisión y te avisamos en cuanto esté listo.",
  ].join("\n");

  await sendTextMessage(buyerPhone, body, {
    trace: {
      source: "consumer",
      kind: "microsite_generation_delayed",
      aggregateId: buyerPhone,
      causationId: args.job.sourceEventId ?? null,
      payload: {
        demandId: args.demandId,
        sourceEventId: args.sourceEventId ?? null,
        jobId: args.job.id,
        reason: args.reason,
      },
    },
  });

  console.log(
    `[consumer] GENERATE_MICROSITE job ${args.job.id} — aviso de demora enviado a ${buyerPhone} reason=${args.reason}`,
  );

  return buyerPhone;
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

const EGESTION_CIRCUIT_ID = "egestion-inmovilla";

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

  const { allowed, state } = await canExecute(EGESTION_CIRCUIT_ID);
  if (!allowed) {
    const retryMs = state.openedAt
      ? Math.max(0, 5 * 60 * 1000 - (Date.now() - state.openedAt.getTime()))
      : 60_000;
    console.warn(
      `[consumer] WRITE_TO_INMOVILLA job ${job.id} — circuit breaker OPEN (fallos=${state.failureCount}), reintentando en ~${Math.round(retryMs / 1000)}s`,
    );
    return {
      success: false,
      error: `Circuit breaker OPEN para ${EGESTION_CIRCUIT_ID} (${state.failureCount} fallos consecutivos)`,
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

    await recordSuccess(EGESTION_CIRCUIT_ID);
    console.log(
      `[consumer] WRITE_TO_INMOVILLA job ${job.id} operación=${operation} — OK`,
    );
    return { success: true };
  } catch (err) {
    const permanent = isErrorPermanent(err);
    const message = err instanceof InmovillaWriteError
      ? `${err.code}: ${err.message}`
      : (err instanceof Error ? err.message : String(err));

    if (!permanent) {
      await recordFailure(EGESTION_CIRCUIT_ID, message);
    }

    const retryLabel = permanent ? "NO RETRIABLE" : "retriable";
    console.error(
      `[consumer] WRITE_TO_INMOVILLA job ${job.id} operación=${operation} — ${message} [${retryLabel}]`,
    );
    return { success: false, error: message, permanent };
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
  const source = getPayloadString(payload, "source");
  const notifyOnEmpty = payload.notifyOnEmpty !== false;

  const result = await generateMicrositeSelection({
    demandId,
    demandNombre,
    comercialId,
    demand,
    sourceEventId,
    source: source ?? undefined,
    selectionFeedbackContext:
      payload.selectionFeedbackContext && typeof payload.selectionFeedbackContext === "object"
        ? payload.selectionFeedbackContext as Parameters<typeof generateMicrositeSelection>[0]["selectionFeedbackContext"]
        : undefined,
  });

  if (!result.ok) {
    let buyerWaId: string | null = null;

    if (result.reason === "EXTERNAL_SEARCH_DISABLED") {
      console.warn(
        `[consumer] GENERATE_MICROSITE job ${job.id} demandId=${demandId} — omitido: ${EXTERNAL_PORTFOLIO_DISABLED_REASON}`,
      );
    } else {
      console.warn(
        `[consumer] GENERATE_MICROSITE job ${job.id} demandId=${demandId} — omitido: ${result.reason}`,
      );
    }

    await alertMicrositeGenerationFailure({
      job,
      demandId,
      reason: result.reason,
      source,
      sourceEventId,
    });

    if (result.reason === "NO_MATCHING_PROPERTIES" && notifyOnEmpty) {
      await notifyBuyerNoStockAvailable({
        job,
        demandId,
        demandNombre,
        sourceEventId,
      });
    } else if (
      notifyOnEmpty &&
      source !== "coverage_scan" &&
      MICROSITE_INFRA_FAILURE_REASONS.has(result.reason)
    ) {
      try {
        buyerWaId = await notifyBuyerMicrositeGenerationDelayed({
          job,
          demandId,
          demandNombre,
          reason: result.reason,
          sourceEventId,
        });
      } catch (err) {
        console.error(
          `[consumer] GENERATE_MICROSITE job ${job.id} — error avisando demora al comprador: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    await appendMicrositeGenerationResultEvent({
      job,
      demandId,
      source,
      sourceEventId,
      notifyOnEmpty,
      status: "skipped",
      reason: result.reason,
      buyerWaId,
    });

    if (result.reason === "EXTERNAL_SEARCH_DISABLED") {
      return { success: true };
    }

    return { success: true };
  }

  console.log(
    `[consumer] GENERATE_MICROSITE job ${job.id} demandId=${demandId} — creado Token=${result.token} props=${result.propertiesCount} stock=${result.stockCount}`,
  );

  const autoValidation = await approveMicrositeByAI(result.selectionId);
  if (!autoValidation.ok) {
    return {
      success: false,
      error: `AI_APPROVAL inline falló: ${autoValidation.error}`,
    };
  }

  console.log(
    `[consumer] GENERATE_MICROSITE job ${job.id} — auto-validado y encolado SEND_MICROSITE_TO_BUYER selectionId=${result.selectionId}`,
  );

  await appendMicrositeGenerationResultEvent({
    job,
    demandId,
    source,
    sourceEventId,
    notifyOnEmpty,
    status: "created",
    selectionId: result.selectionId,
    selectionToken: result.token,
    propertiesCount: result.propertiesCount,
    stockCount: result.stockCount,
  });

  return { success: true };
}

registerJobHandler("GENERATE_MICROSITE", handleGenerateMicrosite);

/**
 * Avisa al comprador por WhatsApp cuando la generación de una nueva selección
 * ha devuelto 0 propiedades que encajen con los criterios. Si ya tiene una
 * selección previa aprobada, se le invita a revisarla mientras se ajustan
 * criterios.
 *
 * Idempotencia: se registra un `WHATSAPP_ENVIADO` con `kind="no_stock_available"`
 * por cada envío; si el job se reintenta para el mismo `sourceEventId`, se
 * detecta el envío previo y no se reenvía.
 */
async function notifyBuyerNoStockAvailable(args: {
  job: JobRecord;
  demandId: string;
  demandNombre: string;
  sourceEventId: string | undefined;
}): Promise<void> {
  const { job, demandId, demandNombre, sourceEventId } = args;

  const buyerPhone = await resolveBuyerPhoneForDemand(demandId);
  if (!buyerPhone) {
    console.warn(
      `[consumer] GENERATE_MICROSITE job ${job.id} — NO_MATCHING_PROPERTIES pero no hay teléfono para demandId=${demandId}; no se avisa al comprador`,
    );
    return;
  }

  if (sourceEventId) {
    const alreadySent = await prisma.event.findFirst({
      where: {
        type: "WHATSAPP_ENVIADO",
        aggregateId: buyerPhone,
        payload: {
          path: ["kind"],
          equals: "no_stock_available",
        },
      },
      select: { id: true, payload: true },
    });
    if (alreadySent) {
      const payload = (alreadySent.payload ?? {}) as Record<string, unknown>;
      if (payload.sourceEventId === sourceEventId) {
        console.log(
          `[consumer] GENERATE_MICROSITE job ${job.id} — aviso NO_MATCHING ya enviado previamente para sourceEventId=${sourceEventId}, se omite`,
        );
        return;
      }
    }
  }

  const lastApproved = await prisma.micrositeSelection.findFirst({
    where: { demandId, status: "APPROVED" },
    orderBy: { createdAt: "desc" },
    select: { token: true },
  });

  const base = getPublicAppUrl();
  const currentSelectionUrl = lastApproved ? `${base}/seleccion/${lastApproved.token}` : null;

  let wamid: string | undefined;
  try {
    const result = await sendNoStockAvailableToBuyer(buyerPhone, {
      demandNombre,
      currentSelectionUrl,
    }, {
      trace: {
        source: "consumer",
        kind: "no_stock_available",
        aggregateId: buyerPhone,
        causationId: job.sourceEventId ?? null,
        payload: {
          demandId,
          sourceEventId: sourceEventId ?? null,
          hasPreviousSelection: Boolean(currentSelectionUrl),
          currentSelectionUrl: currentSelectionUrl ?? null,
        },
      },
    });
    wamid = result.messages?.[0]?.id;
    console.log(
      `[consumer] GENERATE_MICROSITE job ${job.id} — aviso NO_MATCHING enviado a ${buyerPhone} wamid=${wamid ?? "N/A"} hasPreviousSelection=${Boolean(currentSelectionUrl)}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[consumer] GENERATE_MICROSITE job ${job.id} — error avisando NO_MATCHING al comprador: ${message}`,
    );
    return;
  }

}

async function handleSendMicrositeToBuyer(job: JobRecord): Promise<HandlerResult> {
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const selectionId = typeof payload.selectionId === "string" ? payload.selectionId : "";
  if (!selectionId) {
    return { success: false, error: "SEND_MICROSITE_TO_BUYER sin selectionId", permanent: true };
  }

  const result = await sendMicrositeToBuyerHot({
    selectionId,
    source: "consumer:send-microsite",
    causationId: job.sourceEventId ?? null,
  });

  if (!result.ok) {
    const isNotFound = result.error?.includes("no encontrada");
    console.error(
      `[consumer] SEND_MICROSITE_TO_BUYER job ${job.id} — error: ${result.error}`,
    );
    return {
      success: false,
      error: result.error ?? "Error enviando microsite",
      permanent: isNotFound ? true : undefined,
    };
  }

  if (result.skipped) {
    console.warn(
      `[consumer] SEND_MICROSITE_TO_BUYER job ${job.id} — omitido: ${result.skipReason}`,
    );
    return { success: true };
  }

  console.log(
    `[consumer] SEND_MICROSITE_TO_BUYER job ${job.id} — ${result.alreadySent ? "ya enviado" : "enviado"} al comprador selectionId=${selectionId} wamid=${result.wamid ?? "N/A"}`,
  );
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

// --- Smart Closing: generación de borrador de contrato (M8) ---
registerJobHandler("GENERATE_CONTRACT_DRAFT", handleGenerateContractDraft);

// --- Firma digital: envío a firma server-side (M8) ---
import { computeSha256, generateSigningToken, buildSigningUrl } from "@/lib/firma";
import { normalizeDocumentToPdf } from "@/lib/signaturit/pdf-normalization";
import { uploadContractDocument } from "@/lib/cloudinary";

async function handleSendSignatureRequest(job: JobRecord): Promise<HandlerResult> {
  const p = (job.payload ?? {}) as Record<string, unknown>;
  const operationId = typeof p.operationId === "string" ? p.operationId : "";
  const propertyCode = typeof p.propertyCode === "string" ? p.propertyCode : "";
  const documentKind = typeof p.documentKind === "string" ? p.documentKind : "";
  const templateVersion = typeof p.templateVersion === "string" ? p.templateVersion : null;
  const cloudinaryUrl = typeof p.cloudinaryUrl === "string" ? p.cloudinaryUrl : "";
  const signers = Array.isArray(p.signers) ? (p.signers as Array<Record<string, string>>) : [];

  if (!operationId || !propertyCode || !documentKind || !cloudinaryUrl || signers.length === 0) {
    return {
      success: false,
      error: "SEND_SIGNATURE_REQUEST: payload incompleto",
      permanent: true,
    };
  }

  const existing = await prisma.legalDocument.findFirst({
    where: { operationId, documentKind },
    select: { signatureRequestId: true },
  });
  if (existing?.signatureRequestId) {
    console.log(
      `[consumer] SEND_SIGNATURE_REQUEST job ${job.id} — firma ya iniciada (${existing.signatureRequestId}), skip`,
    );
    return { success: true };
  }

  const docRes = await fetch(cloudinaryUrl);
  if (!docRes.ok) {
    return {
      success: false,
      error: `No se pudo descargar documento de Cloudinary (${docRes.status})`,
    };
  }
  const downloadedBuffer = Buffer.from(await docRes.arrayBuffer());
  const contentType = docRes.headers.get("content-type");
  const sourceFileName = `${operationId}_${documentKind}.pdf`;

  let pdfBuffer: Buffer;
  let convertedToPdf = false;
  try {
    const normalized = await normalizeDocumentToPdf({
      buffer: downloadedBuffer,
      contentType,
      sourceFileName,
    });
    pdfBuffer = normalized.pdfBuffer;
    convertedToPdf = normalized.converted;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Normalización PDF falló: ${msg}` };
  }

  let finalCloudinaryUrl = cloudinaryUrl;
  if (convertedToPdf) {
    try {
      const pdfUpload = await uploadContractDocument({
        buffer: pdfBuffer,
        fileName: `${operationId}_${documentKind}.pdf`,
        folder: `contracts/${operationId}`,
        tags: ["pre-signature", "pdf", documentKind],
        context: { operationId, propertyCode },
      });
      finalCloudinaryUrl = pdfUpload.secureUrl;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[consumer] SEND_SIGNATURE_REQUEST — re-upload PDF error: ${msg}`);
    }
  }

  const SLA_DAYS = Number(process.env.SIGNATURIT_SLA_DAYS) || 5;
  const documentHash = computeSha256(pdfBuffer);
  const signingToken = generateSigningToken();
  const signingUrl = buildSigningUrl(signingToken);
  const now = new Date();
  const slaDeadline = new Date(now.getTime() + SLA_DAYS * 24 * 60 * 60 * 1000);

  const signatureRequest = await prisma.signatureRequest.create({
    data: {
      operationId,
      propertyCode,
      documentKind,
      templateVersion,
      cloudinaryUrl: finalCloudinaryUrl,
      signingUrl,
      status: "SENT",
      signerName: signers[0].name ?? "",
      signerEmail: signers[0].email ?? "",
      signerPhone: signers[0].phone ?? null,
      sentAt: now,
      slaDeadlineDays: SLA_DAYS,
      slaDeadline,
      documentHash,
      signingToken,
    },
  });

  await prisma.legalDocument.update({
    where: { operationId_documentKind: { operationId, documentKind } },
    data: {
      status: "SENT_TO_SIGNATURE",
      signatureRequestId: signatureRequest.id,
      cloudinaryUrl: finalCloudinaryUrl,
    },
  });

  const legalDoc = await prisma.legalDocument.findFirst({
    where: { operationId, documentKind },
    select: { id: true },
  });

  if (legalDoc) {
    for (const signer of signers) {
      if (!signer.email) continue;
      await prisma.legalDocumentParty.upsert({
        where: {
          legalDocumentId_email: {
            legalDocumentId: legalDoc.id,
            email: signer.email,
          },
        },
        create: {
          legalDocumentId: legalDoc.id,
          role: signer.role ?? "SIGNER",
          fullName: signer.name ?? "",
          email: signer.email,
          phone: signer.phone ?? null,
        },
        update: {
          fullName: signer.name ?? "",
          phone: signer.phone ?? null,
        },
      });
    }
  }

  await appendEvent({
    type: "FIRMA_ENVIADA",
    aggregateType: "PROPERTY",
    aggregateId: propertyCode,
    payload: {
      signatureRequestId: signatureRequest.id,
      operationId,
      documentKind,
      templateVersion,
      signingUrl,
      documentHash,
      signers: signers.map((s) => ({ name: s.name, email: s.email })),
      slaDeadline: slaDeadline.toISOString(),
      triggeredBy: "CONTRATO_APROBADO_HANDLER",
    },
  });

  console.log(
    `[consumer] SEND_SIGNATURE_REQUEST job ${job.id} — firma creada signatureRequestId=${signatureRequest.id} signingUrl=${signingUrl}`,
  );

  return { success: true };
}

registerJobHandler("SEND_SIGNATURE_REQUEST", handleSendSignatureRequest);

// --- Pricing automático (M7) ---
import { handlePricingAnalysis } from "./pricing-handler";
import { handleNotifyPricingWhatsApp } from "./pricing-notify-handler";
import { handleStatefoxImageImport } from "./statefox-image-import-handler";

registerJobHandler("RUN_PRICING_ANALYSIS", handlePricingAnalysis);
registerJobHandler("NOTIFY_PRICING_WHATSAPP", handleNotifyPricingWhatsApp);
registerJobHandler("IMPORT_STATEFOX_PORTAL_IMAGES", handleStatefoxImageImport);

// --- Post-Venta (M9): cadencia de mensajes al cliente ---
registerJobHandler("SEND_POST_SALE_MESSAGE", handleSendPostSaleMessage);
registerJobHandler("SEND_REVIEW_REQUEST", handleSendReviewRequest);
registerJobHandler("SEND_REVIEW_REMINDER", handleSendReviewReminder);
registerJobHandler("SEND_REFERRAL_REQUEST", handleSendReferralRequest);

// --- Post-Venta cadencias con plantillas (M9) ---
import { handleStartPostventaCadence } from "@/lib/postventa/start-cadence-handler";
import { handleSendPostventaMessage } from "@/lib/postventa/send-message-handler";
import { handleSendPostventaForm } from "@/lib/postventa/send-form-handler";
import { handleSchedulePostventaBirthday } from "@/lib/postventa/schedule-birthday-handler";
import { handleSchedulePostventaNavidad } from "@/lib/postventa/schedule-navidad-handler";

registerJobHandler("START_POSTVENTA_CADENCE", handleStartPostventaCadence);
registerJobHandler("SEND_POSTVENTA_MESSAGE", handleSendPostventaMessage);
registerJobHandler("SEND_POSTVENTA_FORM", handleSendPostventaForm);
registerJobHandler("SCHEDULE_POSTVENTA_BIRTHDAY", handleSchedulePostventaBirthday);
registerJobHandler("SCHEDULE_POSTVENTA_NAVIDAD", handleSchedulePostventaNavidad);

// --- Desarrollo Continuo (M12): cadencia de ejercicios al comercial ---
import { handleSendDevExerciseNudge } from "@/lib/dev-program/send-nudge-handler";

registerJobHandler("SEND_DEV_EXERCISE_NUDGE" as never, handleSendDevExerciseNudge);

// --- Visit Scheduling (M4 rediseño): timeouts, calendar, cleanup, health ---
import {
  handleVisitCheckCommercialTimeout,
  handleVisitCheckBuyerTimeout,
  handleVisitCreateCalendarEvent,
  handleVisitCancelCalendarEvent,
  handleVisitCleanupExpiredLocks,
  handleVisitCheckComposioHealth,
} from "./visit-scheduling-job-handlers";

registerJobHandler("VISIT_CHECK_COMMERCIAL_TIMEOUT", handleVisitCheckCommercialTimeout);
registerJobHandler("VISIT_CHECK_BUYER_TIMEOUT", handleVisitCheckBuyerTimeout);
registerJobHandler("VISIT_CREATE_CALENDAR_EVENT", handleVisitCreateCalendarEvent);
registerJobHandler("VISIT_CANCEL_CALENDAR_EVENT", handleVisitCancelCalendarEvent);
registerJobHandler("VISIT_CLEANUP_EXPIRED_LOCKS", handleVisitCleanupExpiredLocks);
registerJobHandler("VISIT_CHECK_COMPOSIO_HEALTH", handleVisitCheckComposioHealth);

// --- Nota de Encargo ---
import {
  handleNotaEncargoRecordatorio,
  handleNotaEncargoCheckConfirmacion,
  handleNotaEncargoEnviarFormulario,
  handleNotaEncargoMatchingCheck,
} from "./nota-encargo-handlers";

registerJobHandler("NOTA_ENCARGO_RECORDATORIO", handleNotaEncargoRecordatorio);
registerJobHandler("NOTA_ENCARGO_CHECK_CONFIRMACION", handleNotaEncargoCheckConfirmacion);
registerJobHandler("NOTA_ENCARGO_ENVIAR_FORMULARIO", handleNotaEncargoEnviarFormulario);
registerJobHandler("NOTA_ENCARGO_MATCHING_CHECK", handleNotaEncargoMatchingCheck);

// --- Parte de Visita ---
import { handleParteVisitaEnviarFormulario } from "./parte-visita-handlers";

registerJobHandler("PARTE_VISITA_ENVIAR_FORMULARIO", handleParteVisitaEnviarFormulario);

// --- Matching (M5): envío asíncrono de WhatsApp al comprador tras MATCH_GENERADO ---
import { handleSendWhatsAppMatch } from "./match-generado-handler";

registerJobHandler("SEND_WHATSAPP_MATCH", handleSendWhatsAppMatch);

// --- Coverage (M5): evaluación de cobertura de demanda por cartera interna ---
import { handleEvaluateDemandCoverage } from "./coverage-handler";

registerJobHandler("EVALUATE_DEMAND_COVERAGE", handleEvaluateDemandCoverage);

// --- NLU primer contacto (M5): job dedicado para evitar race condition con la
//     proyección de DemandCurrent. Idempotente por demanda.
import { handleStartNluInitialContact } from "./nlu-initial-contact-job-handler";

registerJobHandler("START_NLU_INITIAL_CONTACT", handleStartNluInitialContact);

// --- Matching (M5): rematch masivo por demanda ---
import { handleRebuildMatchesForDemand } from "./rebuild-matches-handler";

registerJobHandler("REBUILD_MATCHES_FOR_DEMAND", handleRebuildMatchesForDemand);

// --- Matching (M5): cruce automático demanda → cartera interna al entrar
//     DEMANDA_CREADA / DEMANDA_MODIFICADA con criterios duros. Idempotencia
//     por evento + dedup |Δscore|<5 vs MATCH_GENERADO previo por par.
import { handleMatchDemandAgainstInternal } from "./match-demand-internal-job-handler";

registerJobHandler(
  "MATCH_DEMAND_AGAINST_INTERNAL",
  handleMatchDemandAgainstInternal,
);

// --- Operaciones v2 (M11): escritura REST de estado de propiedad en Inmovilla ---
import { handleUpdatePropertyStatusInmovilla } from "@/lib/operacion/inmovilla-property-status-handler";

registerJobHandler("UPDATE_PROPERTY_STATUS_INMOVILLA", handleUpdatePropertyStatusInmovilla);

// --- Microsite (M6): acuse al comprador tras pulsar "Me encaja" en una propiedad ---
import { handleSendBuyerInterestAck } from "./buyer-interest-ack-handler";

registerJobHandler("SEND_BUYER_INTEREST_ACK", handleSendBuyerInterestAck);

// --- Core de Mercado (Fases 3-4): pipeline raw → canonical → diff/snapshot ---
import {
  handleMarketNormalizeBatch,
  handleMarketFetchDetail,
  handleMarketResolveIdentity,
  handleMarketResolveAdvertiser,
  handleMarketDiffAndVersion,
  handleMarketRefreshSnapshot,
  handleMarketImportListingImages,
  handleMarketPushAdvertiserToInmovilla,
} from "@/lib/market/jobs";

registerJobHandler("MARKET_NORMALIZE_BATCH", handleMarketNormalizeBatch);
registerJobHandler("MARKET_FETCH_DETAIL", handleMarketFetchDetail);
registerJobHandler("MARKET_RESOLVE_IDENTITY", handleMarketResolveIdentity);
registerJobHandler("MARKET_RESOLVE_ADVERTISER", handleMarketResolveAdvertiser);
registerJobHandler("MARKET_DIFF_AND_VERSION", handleMarketDiffAndVersion);
registerJobHandler("MARKET_REFRESH_SNAPSHOT", handleMarketRefreshSnapshot);
registerJobHandler("MARKET_IMPORT_LISTING_IMAGES", handleMarketImportListingImages);
registerJobHandler(
  "MARKET_PUSH_ADVERTISER_TO_INMOVILLA",
  handleMarketPushAdvertiserToInmovilla,
);

// --- Comercial (M0): transferencia de agente en Inmovilla al eliminar un comercial ---
import { handleTransferPropertyAgent } from "@/lib/comercial/transfer-agent-handler";

registerJobHandler("TRANSFER_PROPERTY_AGENT", handleTransferPropertyAgent);
