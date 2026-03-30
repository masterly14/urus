import type { Event } from "@/types/domain";
import type { EnqueueJobInput } from "@/lib/job-queue/types";
import type { HandlerResult } from "./types";
import { prisma } from "@/lib/prisma";
import { createSignaturitClient } from "@/lib/signaturit";
import { uploadContractDocument } from "@/lib/cloudinary";
import { sendFirmaCompletadaConfirmation } from "@/lib/whatsapp/send";
import { getPublicAppUrl } from "@/lib/microsite/app-url";

interface FirmaCompletadaPayload {
  signatureRequestId: string;
  signaturitSignatureId: string;
  signaturitDocumentId: string;
  operationId: string;
  documentKind?: string;
}

function parsePayload(raw: unknown): FirmaCompletadaPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const signatureRequestId = p.signatureRequestId;
  const signaturitSignatureId = p.signaturitSignatureId;
  const signaturitDocumentId = p.signaturitDocumentId;
  const operationId = p.operationId;

  if (
    typeof signatureRequestId !== "string" ||
    typeof signaturitSignatureId !== "string" ||
    typeof signaturitDocumentId !== "string" ||
    typeof operationId !== "string"
  ) {
    return null;
  }

  return {
    signatureRequestId,
    signaturitSignatureId,
    signaturitDocumentId,
    operationId,
    documentKind:
      typeof p.documentKind === "string" ? p.documentKind : undefined,
  };
}

/**
 * Event handler para FIRMA_COMPLETADA.
 * Descarga documento firmado + audit trail de Signaturit,
 * sube a Cloudinary, actualiza LegalDocument/SignatureRequest,
 * marca parties y encola egestión a Inmovilla si todas firmaron.
 */
export async function handleFirmaCompletada(
  event: Event,
): Promise<HandlerResult> {
  const payload = parsePayload(event.payload);
  if (!payload) {
    return {
      success: false,
      error:
        "FIRMA_COMPLETADA: payload incompleto (faltan signatureRequestId, signaturitSignatureId, signaturitDocumentId u operationId)",
      permanent: true,
    };
  }

  const {
    signatureRequestId,
    signaturitSignatureId,
    signaturitDocumentId,
    operationId,
  } = payload;

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

  const client = createSignaturitClient();

  const [signedPdf, auditTrail] = await Promise.all([
    client.downloadSignedDocument(signaturitSignatureId, signaturitDocumentId),
    client.downloadAuditTrail(signaturitSignatureId, signaturitDocumentId),
  ]);

  const [signedUpload, auditUpload] = await Promise.all([
    uploadContractDocument({
      buffer: signedPdf,
      fileName: `${operationId}_signed.pdf`,
      folder: `contracts/${operationId}/signed`,
      tags: ["signed", "final", sigReq.documentKind],
      context: {
        operationId,
        propertyCode: sigReq.propertyCode,
        documentKind: sigReq.documentKind,
      },
    }),
    uploadContractDocument({
      buffer: auditTrail,
      fileName: `${operationId}_audit_trail.pdf`,
      folder: `contracts/${operationId}/audit`,
      tags: ["audit-trail", sigReq.documentKind],
      context: {
        operationId,
        propertyCode: sigReq.propertyCode,
        documentKind: sigReq.documentKind,
      },
    }),
  ]);

  console.log(
    `[firma-completada] Cloudinary: signed=${signedUpload.secureUrl} audit=${auditUpload.secureUrl}`,
  );

  await prisma.signatureRequest.update({
    where: { id: signatureRequestId },
    data: {
      signedDocumentUrl: signedUpload.secureUrl,
      auditTrailUrl: auditUpload.secureUrl,
    },
  });

  const legalDoc = await prisma.legalDocument.findUnique({
    where: { signatureRequestId },
  });

  if (legalDoc) {
    const now = new Date();

    await prisma.legalDocument.update({
      where: { id: legalDoc.id },
      data: {
        status: "SIGNED",
        signedDocumentUrl: signedUpload.secureUrl,
        auditTrailUrl: auditUpload.secureUrl,
        completedAt: now,
      },
    });

    await prisma.legalDocumentParty.updateMany({
      where: { legalDocumentId: legalDoc.id, hasSigned: false },
      data: { hasSigned: true, signedAt: now },
    });

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
    const legalDocUrl = `${appUrl}/legal/contratos/${legalDoc.id}`;
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
    `[firma-completada] No se encontró LegalDocument para signatureRequestId=${signatureRequestId} — URLs guardadas solo en SignatureRequest`,
  );

  return { success: true };
}
