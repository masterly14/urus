import type { JobType } from "@prisma/client";
import type { JobRecord } from "@/lib/job-queue/types";
import type { HandlerResult } from "./types";
import { appendEvent } from "@/lib/event-store";
import { canExecute, recordSuccess, recordFailure } from "@/lib/circuit-breaker";
import {
  sendLeadAssignedToCommercial,
  sendFollowUpToCommercial,
  sendMicrositePendingValidationToCommercial,
  sendMicrositeLinkToBuyer,
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
import { generateMicrositeSelection } from "@/lib/microsite/selection";
import { autoValidateMicrosite } from "@/lib/microsite/auto-validate";
import { getPublicAppUrl } from "@/lib/microsite/app-url";
import { normalizeWhatsAppDigits, resolveBuyerPhoneForDemand } from "@/lib/microsite/buyer-phone";
import { enqueueJob } from "@/lib/job-queue";
import type { DemandFilterInput } from "@/lib/statefox";
import { handleGenerateContractDraft } from "./contract-draft-handler";
import {
  handleSendPostSaleMessage,
  handleSendReviewRequest,
  handleSendReviewReminder,
  handleSendReferralRequest,
} from "./post-sale-job-handler";

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

  const result = await generateMicrositeSelection({
    demandId,
    demandNombre,
    comercialId,
    demand,
    sourceEventId,
    source: typeof payload.source === "string" ? payload.source : undefined,
  });

  if (!result.ok) {
    console.warn(
      `[consumer] GENERATE_MICROSITE job ${job.id} demandId=${demandId} — omitido: ${result.reason}`,
    );

    // Sólo se avisa al comprador cuando el motivo es "no hay stock que encaje"
    // y el caller no desactivó la notificación (coverage_scan no notifica).
    const notifyOnEmpty = payload.notifyOnEmpty !== false;
    if (result.reason === "NO_MATCHING_PROPERTIES" && notifyOnEmpty) {
      await notifyBuyerNoStockAvailable({
        job,
        demandId,
        demandNombre,
        sourceEventId,
      });
    }

    return { success: true };
  }

  console.log(
    `[consumer] GENERATE_MICROSITE job ${job.id} demandId=${demandId} — creado Token=${result.token} props=${result.propertiesCount} stock=${result.stockCount}`,
  );

  const comercial = await prisma.comercial.findUnique({
    where: { id: comercialId },
    select: { autoValidateMicrosite: true },
  });

  if (comercial?.autoValidateMicrosite) {
    await enqueueJob({
      type: "AUTO_VALIDATE_MICROSITE",
      payload: { selectionId: result.selectionId },
      priority: 30,
      idempotencyKey: `auto_validate_microsite:${result.selectionId}`,
    });
    console.log(
      `[consumer] GENERATE_MICROSITE job ${job.id} — autoValidateMicrosite=true → encolado AUTO_VALIDATE_MICROSITE`,
    );
  } else {
    await enqueueJob({
      type: "NOTIFY_MICROSITE_PENDING_VALIDATION",
      payload: { selectionId: result.selectionId },
      priority: 40,
      idempotencyKey: `notify_microsite_validation:${result.selectionId}`,
    });
  }

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

  await appendEvent({
    type: "WHATSAPP_ENVIADO",
    aggregateType: "WHATSAPP_CONVERSATION",
    aggregateId: buyerPhone,
    payload: {
      messageId: wamid ?? null,
      demandId,
      kind: "no_stock_available",
      sourceEventId: sourceEventId ?? null,
      hasPreviousSelection: Boolean(currentSelectionUrl),
      currentSelectionUrl: currentSelectionUrl ?? null,
    } as unknown as import("@/lib/event-store/types").JsonValue,
  });
}

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

async function handleAutoValidateMicrosite(job: JobRecord): Promise<HandlerResult> {
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const selectionId = typeof payload.selectionId === "string" ? payload.selectionId : "";
  if (!selectionId) {
    return { success: false, error: "AUTO_VALIDATE_MICROSITE sin selectionId", permanent: true };
  }

  const result = await autoValidateMicrosite(selectionId);
  if (!result.ok) {
    console.error(
      `[consumer] AUTO_VALIDATE_MICROSITE job ${job.id} — falló: ${result.error}`,
    );
    return { success: false, error: result.error };
  }

  console.log(
    `[consumer] AUTO_VALIDATE_MICROSITE job ${job.id} — completado, ${result.propertiesProcessed} descripciones generadas`,
  );
  return { success: true };
}

registerJobHandler("AUTO_VALIDATE_MICROSITE", handleAutoValidateMicrosite);

async function handleSendMicrositeToBuyer(job: JobRecord): Promise<HandlerResult> {
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const selectionId = typeof payload.selectionId === "string" ? payload.selectionId : "";
  if (!selectionId) {
    return { success: false, error: "SEND_MICROSITE_TO_BUYER sin selectionId", permanent: true };
  }

  const selection = await prisma.micrositeSelection.findUnique({
    where: { id: selectionId },
    select: {
      id: true,
      token: true,
      status: true,
      demandId: true,
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

  let wamid: string | undefined;
  try {
    const result = await sendMicrositeLinkToBuyer(digits, {
      demandNombre: selection.demandNombre,
      buyerUrl,
    });
    wamid = result.messages?.[0]?.id;
    console.log(
      `[consumer] SEND_MICROSITE_TO_BUYER job ${job.id} — enviado al comprador selectionId=${selectionId} wamid=${wamid ?? "N/A"}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[consumer] SEND_MICROSITE_TO_BUYER — error: ${message}`);
    return { success: false, error: message };
  }

  if (wamid) {
    await appendEvent({
      type: "WHATSAPP_ENVIADO",
      aggregateType: "WHATSAPP_CONVERSATION",
      aggregateId: digits,
      payload: {
        messageId: wamid,
        demandId: selection.demandId,
        selectionId: selection.id,
        selectionToken: selection.token,
        kind: "microsite_link",
        buyerUrl,
      } as unknown as import("@/lib/event-store/types").JsonValue,
    });
  }

  await prisma.whatsAppBuyerSession.upsert({
    where: { waId: digits },
    create: {
      waId: digits,
      demandId: selection.demandId,
      selectionId: selection.id,
      selectionToken: selection.token,
    },
    update: {
      demandId: selection.demandId,
      selectionId: selection.id,
      selectionToken: selection.token,
    },
  });

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

registerJobHandler("RUN_PRICING_ANALYSIS", handlePricingAnalysis);
registerJobHandler("NOTIFY_PRICING_WHATSAPP", handleNotifyPricingWhatsApp);

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
  handleCrearProspectoInmovilla,
} from "./nota-encargo-handlers";

registerJobHandler("NOTA_ENCARGO_RECORDATORIO", handleNotaEncargoRecordatorio);
registerJobHandler("NOTA_ENCARGO_CHECK_CONFIRMACION", handleNotaEncargoCheckConfirmacion);
registerJobHandler("NOTA_ENCARGO_ENVIAR_FORMULARIO", handleNotaEncargoEnviarFormulario);
registerJobHandler("CREAR_PROSPECTO_INMOVILLA", handleCrearProspectoInmovilla);

// --- Parte de Visita ---
import { handleParteVisitaEnviarFormulario } from "./parte-visita-handlers";

registerJobHandler("PARTE_VISITA_ENVIAR_FORMULARIO", handleParteVisitaEnviarFormulario);

// --- Matching (M5): envío asíncrono de WhatsApp al comprador tras MATCH_GENERADO ---
import { handleSendWhatsAppMatch } from "./match-generado-handler";

registerJobHandler("SEND_WHATSAPP_MATCH", handleSendWhatsAppMatch);

// --- Coverage (M5): evaluación de cobertura de demanda por cartera interna ---
import { handleEvaluateDemandCoverage } from "./coverage-handler";

registerJobHandler("EVALUATE_DEMAND_COVERAGE", handleEvaluateDemandCoverage);

// --- Matching (M5): rematch masivo por demanda ---
import { handleRebuildMatchesForDemand } from "./rebuild-matches-handler";

registerJobHandler("REBUILD_MATCHES_FOR_DEMAND", handleRebuildMatchesForDemand);
