import type { JobRecord, EnqueueJobInput } from "@/lib/job-queue/types";
import type { HandlerResult } from "./types";
import { prisma } from "@/lib/prisma";
import { resolveComercialFromAgente } from "@/lib/routing/resolve-comercial";
import {
  sendPostSaleMessage,
  sendReviewRequest,
  sendReviewReminder,
  sendReferralRequest,
  type PostSaleMessageParams,
  type ReviewRequestParams,
  type ReviewReminderParams,
  type ReferralRequestParams,
} from "@/lib/whatsapp/send";
import { appendEvent } from "@/lib/event-store";
import { enqueueJob } from "@/lib/job-queue";
import type { PostSalePhase } from "@/lib/post-sale/cadence";
import { getPhaseLabel } from "@/lib/post-sale/cadence";
import { getPublicAppUrl } from "@/lib/microsite/app-url";

const REVIEW_REMINDER_DELAY_MS = 5 * 24 * 60 * 60 * 1000; // 5 días

interface PostSaleJobPayload {
  propertyCode: string;
  newEstado: string;
  phase: PostSalePhase;
  stepLabel: string;
  closedAt: string;
  sourceEventId?: string;
}

function parsePayload(raw: unknown): PostSaleJobPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.propertyCode !== "string" || typeof obj.phase !== "string") return null;
  return {
    propertyCode: obj.propertyCode as string,
    newEstado: (obj.newEstado as string) ?? "",
    phase: obj.phase as PostSalePhase,
    stepLabel: (obj.stepLabel as string) ?? "",
    closedAt: (obj.closedAt as string) ?? "",
    sourceEventId: typeof obj.sourceEventId === "string" ? obj.sourceEventId : undefined,
  };
}

async function resolveRecipient(propertyCode: string): Promise<{
  phone: string | null;
  clientName: string | null;
  comercialName: string | null;
  clientType: "comprador" | "inversor" | "vendedor" | null;
}> {
  const closedEvent = await prisma.event.findFirst({
    where: {
      type: "OPERACION_CERRADA",
      aggregateId: propertyCode,
    },
    orderBy: { occurredAt: "desc" },
    select: { payload: true },
  });

  const eventPayload = (closedEvent?.payload ?? {}) as Record<string, unknown>;
  const buyerPhone = typeof eventPayload.buyerPhone === "string" ? eventPayload.buyerPhone : null;
  const clientName = typeof eventPayload.clientName === "string" ? eventPayload.clientName : null;
  const clientType = typeof eventPayload.clientType === "string"
    ? eventPayload.clientType as "comprador" | "inversor" | "vendedor"
    : null;

  const property = await prisma.propertySnapshot.findUnique({
    where: { codigo: propertyCode },
    select: { agente: true },
  });

  let comercialName: string | null = null;
  if (property?.agente) {
    const comercial = await resolveComercialFromAgente(property.agente);
    comercialName = comercial?.nombre ?? property.agente;
  }

  return { phone: buyerPhone, clientName, comercialName, clientType };
}

/**
 * Procesa SEND_POST_SALE_MESSAGE (fases: agradecimiento, soporte, recaptación).
 */
export async function handleSendPostSaleMessage(
  job: JobRecord,
): Promise<HandlerResult> {
  const payload = parsePayload(job.payload);
  if (!payload) {
    return { success: false, error: "SEND_POST_SALE_MESSAGE sin payload válido", permanent: true };
  }

  const { phone, clientName, comercialName } = await resolveRecipient(payload.propertyCode);

  if (!phone) {
    console.warn(
      `[post-sale] SEND_POST_SALE_MESSAGE job ${job.id} phase=${payload.phase} propertyCode=${payload.propertyCode} — sin teléfono cliente, completando sin envío`,
    );
    return { success: true };
  }

  const base = getPublicAppUrl();
  const postVentaUrl = payload.phase === "soporte"
    ? `${base}/post-venta/operacion/${payload.propertyCode}`
    : undefined;

  const params: PostSaleMessageParams = {
    propertyCode: payload.propertyCode,
    phase: payload.phase,
    newEstado: payload.newEstado,
    clientName: clientName ?? undefined,
    comercialName: comercialName ?? undefined,
    postVentaUrl,
  };

  await sendPostSaleMessage(phone, params);

  console.log(
    `[post-sale] SEND_POST_SALE_MESSAGE job ${job.id} phase=${payload.phase} (${getPhaseLabel(payload.phase)}) → enviado a ${phone} propertyCode=${payload.propertyCode}`,
  );

  return { success: true };
}

/**
 * Procesa SEND_REVIEW_REQUEST (fase: reseña D+12).
 * Verifica que no haya incidencias abiertas antes de solicitar la reseña.
 */
export async function handleSendReviewRequest(
  job: JobRecord,
): Promise<HandlerResult> {
  const payload = parsePayload(job.payload);
  if (!payload) {
    return { success: false, error: "SEND_REVIEW_REQUEST sin payload válido", permanent: true };
  }

  const { phone, clientName } = await resolveRecipient(payload.propertyCode);

  if (!phone) {
    console.warn(
      `[post-sale] SEND_REVIEW_REQUEST job ${job.id} propertyCode=${payload.propertyCode} — sin teléfono cliente, completando sin envío`,
    );
    return { success: true };
  }

  const hasIncidencia = await checkOpenIncidencias(payload.propertyCode);
  if (hasIncidencia) {
    console.log(
      `[post-sale] SEND_REVIEW_REQUEST job ${job.id} propertyCode=${payload.propertyCode} — incidencia abierta, posponiendo reseña`,
    );
    return { success: true };
  }

  const alreadySent = await hasReviewAlreadySent(payload.propertyCode);
  if (alreadySent) {
    console.log(
      `[post-sale] SEND_REVIEW_REQUEST job ${job.id} propertyCode=${payload.propertyCode} — ya enviada (idempotencia)`,
    );
    return { success: true };
  }

  const googleReviewUrl = process.env.GOOGLE_REVIEW_URL ?? undefined;

  const params: ReviewRequestParams = {
    propertyCode: payload.propertyCode,
    clientName: clientName ?? undefined,
    googleReviewUrl,
  };

  await sendReviewRequest(phone, params);

  const reviewEvent = await appendEvent({
    type: "RESENA_SOLICITADA",
    aggregateType: "OPERACION",
    aggregateId: payload.propertyCode,
    payload: {
      propertyCode: payload.propertyCode,
      sentTo: phone,
      googleReviewUrl: googleReviewUrl ?? null,
      sourceJobId: job.id,
    },
    correlationId: job.sourceEventId ?? undefined,
    causationId: job.sourceEventId ?? undefined,
  });

  const followUpJobs: EnqueueJobInput[] = [];

  followUpJobs.push({
    type: "SEND_REVIEW_REMINDER",
    payload: {
      propertyCode: payload.propertyCode,
      newEstado: payload.newEstado,
      phase: "resena",
      stepLabel: "D+17 reminder",
      closedAt: payload.closedAt,
      sourceEventId: reviewEvent.id,
    },
    availableAt: new Date(Date.now() + REVIEW_REMINDER_DELAY_MS),
    idempotencyKey: `review_reminder:${payload.propertyCode}`,
    sourceEventId: reviewEvent.id,
  });

  for (const fjob of followUpJobs) {
    await enqueueJob(fjob);
  }

  console.log(
    `[post-sale] SEND_REVIEW_REQUEST job ${job.id} → enviado a ${phone} propertyCode=${payload.propertyCode} — RESENA_SOLICITADA emitida (${reviewEvent.id}), reminder programado en 5 días`,
  );

  return { success: true };
}

/**
 * Procesa SEND_REFERRAL_REQUEST (fase: referidos D+25).
 * Personaliza el mensaje según tipo de cliente.
 * Idempotencia: si ya se envió (REFERIDO_SOLICITUD_ENVIADA), skip.
 */
export async function handleSendReferralRequest(
  job: JobRecord,
): Promise<HandlerResult> {
  const payload = parsePayload(job.payload);
  if (!payload) {
    return { success: false, error: "SEND_REFERRAL_REQUEST sin payload válido", permanent: true };
  }

  const { phone, clientName, clientType } = await resolveRecipient(payload.propertyCode);

  if (!phone) {
    console.warn(
      `[post-sale] SEND_REFERRAL_REQUEST job ${job.id} propertyCode=${payload.propertyCode} — sin teléfono cliente, completando sin envío`,
    );
    return { success: true };
  }

  const alreadySent = await hasReferralAlreadySent(payload.propertyCode);
  if (alreadySent) {
    console.log(
      `[post-sale] SEND_REFERRAL_REQUEST job ${job.id} propertyCode=${payload.propertyCode} — ya enviada (idempotencia)`,
    );
    return { success: true };
  }

  const base = getPublicAppUrl();
  const referralFormUrl = `${base}/referidos/${payload.propertyCode}`;

  const params: ReferralRequestParams = {
    propertyCode: payload.propertyCode,
    clientName: clientName ?? undefined,
    clientType: clientType ?? "comprador",
    referralFormUrl,
  };

  await sendReferralRequest(phone, params);

  await appendEvent({
    type: "REFERIDO_SOLICITUD_ENVIADA",
    aggregateType: "OPERACION",
    aggregateId: payload.propertyCode,
    payload: {
      propertyCode: payload.propertyCode,
      sentTo: phone,
      referralFormUrl,
      clientType: clientType ?? "comprador",
      sourceJobId: job.id,
    },
    correlationId: job.sourceEventId ?? undefined,
    causationId: job.sourceEventId ?? undefined,
  });

  console.log(
    `[post-sale] SEND_REFERRAL_REQUEST job ${job.id} → enviado a ${phone} propertyCode=${payload.propertyCode} clientType=${clientType ?? "comprador"} — REFERIDO_SOLICITUD_ENVIADA emitida`,
  );

  return { success: true };
}

/**
 * Procesa SEND_REVIEW_REMINDER (D+17 aprox).
 * Si el cliente ya dejó reseña (RESENA_RECIBIDA) → skip.
 * Si no → envía recordatorio y emite RECORDATORIO_RESENA_ENVIADO.
 */
export async function handleSendReviewReminder(
  job: JobRecord,
): Promise<HandlerResult> {
  const payload = parsePayload(job.payload);
  if (!payload) {
    return { success: false, error: "SEND_REVIEW_REMINDER sin payload válido", permanent: true };
  }

  const { phone, clientName } = await resolveRecipient(payload.propertyCode);

  if (!phone) {
    console.warn(
      `[post-sale] SEND_REVIEW_REMINDER job ${job.id} propertyCode=${payload.propertyCode} — sin teléfono cliente, completando sin envío`,
    );
    return { success: true };
  }

  const alreadyResponded = await hasReviewResponse(payload.propertyCode);
  if (alreadyResponded) {
    console.log(
      `[post-sale] SEND_REVIEW_REMINDER job ${job.id} propertyCode=${payload.propertyCode} — cliente ya respondió, skip`,
    );
    return { success: true };
  }

  const googleReviewUrl = process.env.GOOGLE_REVIEW_URL ?? undefined;

  const params: ReviewReminderParams = {
    propertyCode: payload.propertyCode,
    clientName: clientName ?? undefined,
    googleReviewUrl,
  };

  await sendReviewReminder(phone, params);

  await appendEvent({
    type: "RECORDATORIO_RESENA_ENVIADO",
    aggregateType: "OPERACION",
    aggregateId: payload.propertyCode,
    payload: {
      propertyCode: payload.propertyCode,
      sentTo: phone,
      googleReviewUrl: googleReviewUrl ?? null,
      sourceJobId: job.id,
    },
    correlationId: job.sourceEventId ?? undefined,
    causationId: job.sourceEventId ?? undefined,
  });

  console.log(
    `[post-sale] SEND_REVIEW_REMINDER job ${job.id} → recordatorio enviado a ${phone} propertyCode=${payload.propertyCode}`,
  );

  return { success: true };
}

// ---------------------------------------------------------------------------
// Helpers de trazabilidad de referidos
// ---------------------------------------------------------------------------

async function hasReferralAlreadySent(propertyCode: string): Promise<boolean> {
  const count = await prisma.event.count({
    where: {
      aggregateId: propertyCode,
      aggregateType: "OPERACION",
      type: "REFERIDO_SOLICITUD_ENVIADA",
    },
  });
  return count > 0;
}

// ---------------------------------------------------------------------------
// Helpers de trazabilidad de reseñas
// ---------------------------------------------------------------------------

async function hasReviewAlreadySent(propertyCode: string): Promise<boolean> {
  const count = await prisma.event.count({
    where: {
      aggregateId: propertyCode,
      aggregateType: "OPERACION",
      type: "RESENA_SOLICITADA",
    },
  });
  return count > 0;
}

async function hasReviewResponse(propertyCode: string): Promise<boolean> {
  const count = await prisma.event.count({
    where: {
      aggregateId: propertyCode,
      aggregateType: "OPERACION",
      type: "RESENA_RECIBIDA",
    },
  });
  return count > 0;
}

/**
 * Verifica si hay incidencias de soporte abiertas para una propiedad.
 * Si el cliente respondió "Necesito ayuda" en la fase de soporte,
 * la cadencia de reseña se pausa hasta que se resuelva.
 *
 * MVP: busca en el Event Store si existe algún evento de incidencia sin resolución.
 * Producción: consultar tabla de incidencias dedicada.
 */
async function checkOpenIncidencias(propertyCode: string): Promise<boolean> {
  const incidenciaCount = await prisma.event.count({
    where: {
      aggregateId: propertyCode,
      aggregateType: "OPERACION",
      type: "WHATSAPP_RECIBIDO",
      payload: { path: ["needsHelp"], equals: true },
    },
  });
  return incidenciaCount > 0;
}
