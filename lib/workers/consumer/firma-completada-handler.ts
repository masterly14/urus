import type { Event } from "@/types/domain";
import type { EnqueueJobInput } from "@/lib/job-queue/types";
import type { HandlerResult } from "./types";
import { prisma } from "@/lib/prisma";
import { sendFirmaCompletadaConfirmation } from "@/lib/whatsapp/send";
import { getPublicAppUrl } from "@/lib/microsite/app-url";

interface FirmaCompletadaPayload {
  signatureRequestId: string;
  operationId: string;
  documentKind?: string;
}

function parsePayload(raw: unknown): FirmaCompletadaPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const signatureRequestId = p.signatureRequestId;
  const operationId = p.operationId;

  if (typeof signatureRequestId !== "string" || typeof operationId !== "string") {
    return null;
  }

  return {
    signatureRequestId,
    operationId,
    documentKind: typeof p.documentKind === "string" ? p.documentKind : undefined,
  };
}

/**
 * Event handler para FIRMA_COMPLETADA.
 *
 * Con la firma in-house, el PDF firmado y el audit trail ya están en Cloudinary
 * al momento de llegar el evento (generados por POST /api/firma/{token}/sign).
 * Este handler solo encola egestión a Inmovilla y envía WhatsApp de confirmación.
 */
export async function handleFirmaCompletada(
  event: Event,
): Promise<HandlerResult> {
  const payload = parsePayload(event.payload);
  if (!payload) {
    return {
      success: false,
      error:
        "FIRMA_COMPLETADA: payload incompleto (faltan signatureRequestId u operationId)",
      permanent: true,
    };
  }

  const { signatureRequestId, operationId } = payload;

  console.log(
    `[firma-completada] Procesando signatureRequestId=${signatureRequestId} operationId=${operationId}`,
  );

  const sigReq = await prisma.signatureRequest.findUnique({
    where: { id: signatureRequestId },
  });

  if (!sigReq) {
    return {
      success: false,
      error: `SignatureRequest ${signatureRequestId} no encontrada`,
      permanent: true,
    };
  }

  const legalDoc = await prisma.legalDocument.findUnique({
    where: { signatureRequestId },
  });

  if (legalDoc) {
    const followUpJobs: EnqueueJobInput[] = [
      {
        type: "WRITE_TO_INMOVILLA",
        payload: {
          operation: "UPDATE_PROPERTY_STATUS",
          args: {
            propertyCode: sigReq.propertyCode,
            estadoficha: "vendido",
          },
        },
        idempotencyKey: `write_inmovilla_post_firma:${operationId}`,
        sourceEventId: event.id,
      },
    ];

    console.log(
      `[firma-completada] Firma completa — encolando WRITE_TO_INMOVILLA para ${sigReq.propertyCode}`,
    );

    const appUrl = getPublicAppUrl();
    const legalDocUrl = `${appUrl}/platform/legal/contratos/${legalDoc.id}`;
    const confirmParams = {
      operationRef: operationId,
      documentKind: sigReq.documentKind,
      legalDocUrl,
    };

    const sellerPhone = process.env.SELLER_DEFAULT_PHONE ?? "34601257555";
    try {
      await sendFirmaCompletadaConfirmation(sellerPhone, confirmParams);
    } catch (err) {
      console.error(
        `[firma-completada] Error WA vendedor: ${err instanceof Error ? err.message : err}`,
      );
    }

    const comercialPhone = process.env.ALERT_WHATSAPP_TO;
    if (comercialPhone) {
      try {
        await sendFirmaCompletadaConfirmation(comercialPhone, confirmParams);
      } catch (err) {
        console.error(
          `[firma-completada] Error WA comercial: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    return { success: true, followUpJobs };
  }

  console.warn(
    `[firma-completada] No se encontró LegalDocument para signatureRequestId=${signatureRequestId}`,
  );

  return { success: true };
}
