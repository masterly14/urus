import type { Event } from "@/types/domain";
import type { HandlerResult } from "./types";
import { prisma } from "@/lib/prisma";
import { sendSignatureInitialNotification } from "@/lib/whatsapp/send";
import { emitManagementAlert } from "@/lib/notifications/emit";
import { updateDemandLeadStatus, updateLeadStatusByOperationId } from "@/lib/projections/update-lead-status";

interface FirmaEnviadaPayload {
  signatureRequestId: string;
  operationId: string;
  documentKind: string;
  signingUrl?: string;
  signerPhone?: string;
}

function parsePayload(raw: unknown): FirmaEnviadaPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (
    typeof p.signatureRequestId !== "string" ||
    typeof p.operationId !== "string" ||
    typeof p.documentKind !== "string"
  ) {
    return null;
  }
  return {
    signatureRequestId: p.signatureRequestId,
    operationId: p.operationId,
    documentKind: p.documentKind,
    signingUrl: typeof p.signingUrl === "string" ? p.signingUrl : undefined,
    signerPhone: typeof p.signerPhone === "string" ? p.signerPhone : undefined,
  };
}

function isMetaTemplateParameterMismatch(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("132000");
}

async function sendSignatureNotificationWithFallback(params: {
  phone: string;
  signerName: string;
  documentKind: string;
  operationId: string;
  signingUrl: string;
  eventId: string;
  correlationId: string | null;
  signatureRequestId: string;
}): Promise<void> {
  try {
    await sendSignatureInitialNotification(
      params.phone,
      {
        signerName: params.signerName,
        documentKind: params.documentKind,
        operationRef: params.operationId,
        signingUrl: params.signingUrl,
      },
      {
        trace: {
          source: "firma_enviada_handler",
          kind: "signature_initial",
          causationId: params.eventId,
          correlationId: params.correlationId,
          payload: {
            signatureRequestId: params.signatureRequestId,
            operationId: params.operationId,
            documentKind: params.documentKind,
          },
        },
      },
    );
  } catch (err) {
    if (!isMetaTemplateParameterMismatch(err)) {
      throw err;
    }

    // Fallback operativo: si la plantilla Meta no matchea parámetros, enviamos
    // texto libre para no bloquear el flujo de firma en producción.
    await sendSignatureInitialNotification(
      params.phone,
      {
        signerName: params.signerName,
        documentKind: params.documentKind,
        operationRef: params.operationId,
        signingUrl: params.signingUrl,
      },
      {
        useTemplate: false,
        trace: {
          source: "firma_enviada_handler",
          kind: "signature_initial_text_fallback",
          causationId: params.eventId,
          correlationId: params.correlationId,
          payload: {
            signatureRequestId: params.signatureRequestId,
            operationId: params.operationId,
            documentKind: params.documentKind,
            fallbackReason: "meta_template_132000",
          },
        },
      },
    );
  }
}

/**
 * Handler de FIRMA_ENVIADA:
 * Envía la URL de firma por WhatsApp a cada firmante con teléfono.
 */
export async function handleFirmaEnviada(
  event: Event,
): Promise<HandlerResult> {
  const payload = parsePayload(event.payload);
  if (!payload) {
    return {
      success: false,
      error: "FIRMA_ENVIADA: payload incompleto",
      permanent: true,
    };
  }

  const { signatureRequestId, operationId, documentKind } = payload;

  const sigReq = await prisma.signatureRequest.findUnique({
    where: { id: signatureRequestId },
    select: { signingUrl: true },
  });

  const signingUrl = payload.signingUrl ?? sigReq?.signingUrl ?? "";

  if (!signingUrl) {
    console.warn(
      `[firma-enviada] No signingUrl for signatureRequestId=${signatureRequestId}`,
    );
    return { success: true };
  }

  const preferSignerPhone =
    (documentKind === "NOTA_ENCARGO" || documentKind === "PARTE_VISITA") &&
    typeof payload.signerPhone === "string" &&
    payload.signerPhone.trim().length > 0;

  const parties = preferSignerPhone
    ? [{ fullName: "Firmante", phone: payload.signerPhone ?? null }]
    : await prisma.legalDocumentParty.findMany({
        where: {
          legalDocument: { signatureRequestId },
          phone: { not: null },
        },
        select: { fullName: true, phone: true },
      });

  let sent = 0;

  for (const party of parties) {
    if (!party.phone) continue;
    try {
      await sendSignatureNotificationWithFallback({
        phone: party.phone,
        signerName: party.fullName,
        documentKind,
        operationId,
        signingUrl,
        eventId: event.id,
        correlationId: event.correlationId,
        signatureRequestId,
      });
      sent++;
      console.log(
        `[firma-enviada] WA enviado a ${party.fullName} (${party.phone}) para ${operationId}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[firma-enviada] Error WA a ${party.fullName}: ${msg}`,
      );
    }
  }

  if (sent === 0 && parties.length === 0) {
    const fallbackPhone = process.env.SELLER_DEFAULT_PHONE ?? "34601257555";
    try {
      await sendSignatureNotificationWithFallback({
        phone: fallbackPhone,
        signerName: "Firmante",
        documentKind,
        operationId,
        signingUrl,
        eventId: event.id,
        correlationId: event.correlationId,
        signatureRequestId,
      });
      console.log(
        `[firma-enviada] WA fallback enviado a ${fallbackPhone} para ${operationId}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[firma-enviada] Error WA fallback: ${msg}`);
    }
  }

  try {
    await emitManagementAlert({
      source: "legal",
      severity: "info",
      title: "Firma enviada a signatarios",
      description:
        `Operacion ${operationId} (${documentKind}) enviada para firma.\n` +
        `Firmantes notificados por WhatsApp: ${sent}.`,
    });
  } catch (err) {
    console.error(
      `[firma-enviada] Error enviando notificación interna: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const rawPayload = event.payload as Record<string, unknown> | null;
  const demandIdFromPayload = typeof rawPayload?.demandId === "string" ? rawPayload.demandId : null;

  if (demandIdFromPayload) {
    try {
      await updateDemandLeadStatus(demandIdFromPayload, "EN_FIRMA");
    } catch (err) {
      console.warn(
        `[firma-enviada] Error actualizando leadStatus (directo): ${err instanceof Error ? err.message : err}`,
      );
    }
  } else {
    try {
      await updateLeadStatusByOperationId(operationId, "EN_FIRMA");
    } catch (err) {
      console.warn(
        `[firma-enviada] Error actualizando leadStatus: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  return { success: true };
}
