import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store/event-store";
import type { SignatureRequestStatus } from "@/app/generated/prisma/client";
import type { SignaturitWebhookPayload } from "./types";
import { isSignatureTerminalStatus } from "./status";

const ALLOWED_IP = process.env.SIGNATURIT_WEBHOOK_ALLOWED_IP ?? "";

type WebhookDateField =
  | "openedAt"
  | "signedAt"
  | "completedAt"
  | "declinedAt"
  | "expiredAt";

type WebhookEventMapping = {
  status: SignatureRequestStatus;
  dateField?: WebhookDateField;
  eventType?: "FIRMA_COMPLETADA" | "FIRMA_RECHAZADA" | "FIRMA_EXPIRADA";
};

type WebhookPayloadWithOptionalSignatureId = SignaturitWebhookPayload & {
  signature_id?: string;
  signatureId?: string;
  signature?: { id?: string };
};

const EVENT_MAP: Record<string, WebhookEventMapping> = {
  document_opened: { status: "OPENED", dateField: "openedAt" },
  document_signed: { status: "SIGNED", dateField: "signedAt" },
  document_completed: {
    status: "COMPLETED",
    dateField: "completedAt",
    eventType: "FIRMA_COMPLETADA",
  },
  document_declined: {
    status: "DECLINED",
    dateField: "declinedAt",
    eventType: "FIRMA_RECHAZADA",
  },
  document_expired: {
    status: "EXPIRED",
    dateField: "expiredAt",
    eventType: "FIRMA_EXPIRADA",
  },
  document_canceled: { status: "CANCELED" },
};

function extractForwardedIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "";
}

/**
 * Procesa el POST del webhook de Signaturit (cuerpo JSON).
 * Signaturit envía JSON cuando `events_url` termina en `.json` (ver docs Events URL).
 * Usado por `/api/signaturit/webhook` y `/api/signaturit/webhook.json`.
 */
export async function handleSignaturitWebhookPost(
  request: Request,
): Promise<NextResponse> {
  if (ALLOWED_IP) {
    const clientIp = extractForwardedIp(request);
    if (clientIp && clientIp !== ALLOWED_IP) {
      console.warn(
        `[signaturit/webhook] Rejected request from IP ${clientIp} (expected ${ALLOWED_IP})`,
      );
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  let payload: WebhookPayloadWithOptionalSignatureId;
  try {
    payload = (await request.json()) as SignaturitWebhookPayload;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const eventType = payload.type;
  const mapping = EVENT_MAP[eventType];

  if (!mapping) {
    console.log(
      `[signaturit/webhook] Ignoring unmapped event type: ${eventType}`,
    );
    return NextResponse.json({ ok: true, ignored: true });
  }

  const documentId = payload.document?.id;
  const signatureId =
    payload.signature_id ?? payload.signatureId ?? payload.signature?.id;
  if (!documentId) {
    console.warn("[signaturit/webhook] Payload missing document.id");
    return NextResponse.json(
      { error: "Missing document.id" },
      { status: 400 },
    );
  }

  const sigRequest = await prisma.signatureRequest.findFirst({
    where: {
      OR: [
        { signaturitDocumentId: documentId },
        ...(signatureId ? [{ signaturitSignatureId: signatureId }] : []),
      ],
    },
  });

  if (!sigRequest) {
    console.warn(
      `[signaturit/webhook] No SignatureRequest found for document ${documentId}`,
    );
    return NextResponse.json({ ok: true, matched: false });
  }

  if (isSignatureTerminalStatus(sigRequest.status)) {
    console.log(
      `[signaturit/webhook] Idempotent skip: signatureRequest=${sigRequest.id} already in terminal status=${sigRequest.status}`,
    );
    return NextResponse.json({ ok: true, idempotent: true });
  }

  const now = new Date();
  const updateData: Record<string, unknown> = { status: mapping.status };
  if (mapping.dateField) {
    updateData[mapping.dateField] = now;
  }

  await prisma.signatureRequest.update({
    where: { id: sigRequest.id },
    data: updateData,
  });

  if (mapping.eventType) {
    await appendEvent({
      type: mapping.eventType,
      aggregateType: "PROPERTY",
      aggregateId: sigRequest.propertyCode,
      payload: {
        signatureRequestId: sigRequest.id,
        signaturitSignatureId: sigRequest.signaturitSignatureId,
        signaturitDocumentId: documentId,
        operationId: sigRequest.operationId,
        documentKind: sigRequest.documentKind,
        webhookEventType: eventType,
      },
    });
  }

  console.log(
    `[signaturit/webhook] Updated signatureRequest=${sigRequest.id} status=${mapping.status} event=${eventType}`,
  );

  return NextResponse.json({ ok: true, status: mapping.status });
}
