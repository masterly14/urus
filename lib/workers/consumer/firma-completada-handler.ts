import type { Event } from "@/types/domain";
import type { EnqueueJobInput } from "@/lib/job-queue/types";
import type { HandlerResult } from "./types";
import { prisma } from "@/lib/prisma";
import { enqueueJob } from "@/lib/job-queue";
import { sendFirmaCompletadaConfirmation } from "@/lib/whatsapp/send";
import { sendNotaEncargoDocumentoFirmado } from "@/lib/nota-encargo/whatsapp";
import { sendParteVisitaDocumentoFirmado } from "@/lib/parte-visita/whatsapp";
import { getPublicAppUrl } from "@/lib/microsite/app-url";
import { emitManagementAlert } from "@/lib/notifications/emit";
import { updateDemandLeadStatus, updateLeadStatusByOperationId } from "@/lib/projections/update-lead-status";

interface FirmaCompletadaPayload {
  signatureRequestId: string;
  operationId: string;
  documentKind?: string;
  signedDocumentUrl?: string;
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
    signedDocumentUrl: typeof p.signedDocumentUrl === "string" ? p.signedDocumentUrl : undefined,
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

  // --- Nota de Encargo: enviar documento firmado al propietario ---
  if (payload.documentKind === "NOTA_ENCARGO" || sigReq.documentKind === "NOTA_ENCARGO") {
    const signedUrl = payload.signedDocumentUrl ?? sigReq.signedDocumentUrl;
    const notaSession = await prisma.notaEncargoSession.findFirst({
      where: { signatureRequestId },
    });

    if (notaSession && signedUrl) {
      try {
        await sendNotaEncargoDocumentoFirmado(notaSession.propietarioPhone, {
          propertyRef: notaSession.propertyRef,
          signedDocumentUrl: signedUrl,
        });

        await prisma.notaEncargoSession.update({
          where: { id: notaSession.id },
          data: { state: "DOCUMENTO_ENVIADO", signedDocumentUrl: signedUrl },
        });

        console.log(
          `[firma-completada] Documento firmado enviado al propietario — session=${notaSession.id}`,
        );
      } catch (err) {
        console.error(
          `[firma-completada] Error enviando documento firmado al propietario: ${err instanceof Error ? err.message : err}`,
        );
      }
    } else {
      console.warn(
        `[firma-completada] NOTA_ENCARGO: session o signedUrl no disponible — session=${notaSession?.id} signedUrl=${signedUrl}`,
      );
    }
  }

  // --- Parte de Visita: enviar documento firmado al comprador ---
  if (payload.documentKind === "PARTE_VISITA" || sigReq.documentKind === "PARTE_VISITA") {
    const signedUrl = payload.signedDocumentUrl ?? sigReq.signedDocumentUrl;
    const parteSession = await prisma.parteVisitaSession.findFirst({
      where: { signatureRequestId },
    });

    if (parteSession && signedUrl) {
      try {
        await sendParteVisitaDocumentoFirmado(parteSession.buyerPhone, {
          propertyRef: parteSession.propertyRef,
          signedDocumentUrl: signedUrl,
        });

        await prisma.parteVisitaSession.update({
          where: { id: parteSession.id },
          data: { state: "DOCUMENTO_ENVIADO", signedDocumentUrl: signedUrl },
        });

        // Notify the comercial
        const comercial = await prisma.comercial.findUnique({
          where: { id: parteSession.comercialId },
          select: { telefono: true, nombre: true },
        });
        if (comercial?.telefono) {
          try {
            await sendFirmaCompletadaConfirmation(comercial.telefono, {
              operationRef: parteSession.propertyRef,
              documentKind: "PARTE_VISITA",
              legalDocUrl: "",
            });
          } catch (err) {
            console.error(
              `[firma-completada] Error notifying comercial about parte visita: ${err instanceof Error ? err.message : err}`,
            );
          }
        }

        console.log(
          `[firma-completada] Parte de visita firmado enviado al comprador — session=${parteSession.id}`,
        );
      } catch (err) {
        console.error(
          `[firma-completada] Error enviando parte de visita firmado: ${err instanceof Error ? err.message : err}`,
        );
      }
    } else {
      console.warn(
        `[firma-completada] PARTE_VISITA: session o signedUrl no disponible — session=${parteSession?.id} signedUrl=${signedUrl}`,
      );
    }
  }

  const legalDoc = await prisma.legalDocument.findUnique({
    where: { signatureRequestId },
  });

  if (legalDoc) {
    const followUpJobs: EnqueueJobInput[] = [
      {
        type: "UPDATE_PROPERTY_STATUS_INMOVILLA",
        payload: {
          propertyCode: sigReq.propertyCode,
          estadoficha: 3,
          operacionId: operationId,
        },
        idempotencyKey: `update_property_status:${operationId}`,
        sourceEventId: event.id,
      },
    ];

    console.log(
      `[firma-completada] Firma completa — encolando UPDATE_PROPERTY_STATUS_INMOVILLA para ${sigReq.propertyCode}`,
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

    try {
      await emitManagementAlert({
        source: "legal",
        severity: "info",
        title: "Firma completada",
        description:
          `Operacion ${operationId} (${sigReq.documentKind}) completada y marcada para egestion.\n` +
          `Panel: ${legalDocUrl}`,
      });
    } catch (err) {
      console.error(
        `[firma-completada] Error enviando notificación interna: ${err instanceof Error ? err.message : err}`,
      );
    }

    const rawPayload = event.payload as Record<string, unknown> | null;
    const demandIdFromPayload = typeof rawPayload?.demandId === "string" ? rawPayload.demandId : null;

    if (demandIdFromPayload) {
      try {
        await updateDemandLeadStatus(demandIdFromPayload, "CERRADO");
      } catch (err) {
        console.warn(
          `[firma-completada] Error actualizando leadStatus (directo): ${err instanceof Error ? err.message : err}`,
        );
      }
    } else {
      try {
        await updateLeadStatusByOperationId(operationId, "CERRADO");
      } catch (err) {
        console.warn(
          `[firma-completada] Error actualizando leadStatus: ${err instanceof Error ? err.message : err}`,
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
