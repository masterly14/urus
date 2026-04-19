import type { Event } from "@/types/domain";
import type { HandlerResult } from "./types";
import { prisma } from "@/lib/prisma";
import { getPublicAppUrl } from "@/lib/microsite/app-url";
import { sendContractDraftReadyNotification } from "@/lib/whatsapp/send";
import { updateDemandLeadStatus, updateLeadStatusByOperationId } from "@/lib/projections/update-lead-status";

interface BorradorPayload {
  operationId: string;
  propertyCode: string;
  documentKind: string;
  demandId?: string;
  operacionId?: string;
  cloudinary?: { secureUrl?: string };
}

function parsePayload(raw: unknown): BorradorPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (
    typeof p.operationId !== "string" ||
    typeof p.propertyCode !== "string" ||
    typeof p.documentKind !== "string"
  ) {
    return null;
  }
  const cloudinary = p.cloudinary as
    | { secureUrl?: string }
    | undefined;
  return {
    operationId: p.operationId,
    propertyCode: p.propertyCode,
    documentKind: p.documentKind,
    demandId: typeof p.demandId === "string" ? p.demandId : undefined,
    operacionId: typeof p.operacionId === "string" ? p.operacionId : undefined,
    cloudinary,
  };
}

/**
 * Handler de CONTRATO_BORRADOR_GENERADO:
 * Notifica al gestor (vendedor) y al comercial que hay un borrador listo.
 */
export async function handleContratoBorradorGenerado(
  event: Event,
): Promise<HandlerResult> {
  const payload = parsePayload(event.payload);
  if (!payload) {
    return {
      success: false,
      error: "CONTRATO_BORRADOR_GENERADO: payload incompleto",
      permanent: true,
    };
  }

  const { operationId, documentKind } = payload;
  const cloudinaryUrl = payload.cloudinary?.secureUrl ?? "";
  const appUrl = getPublicAppUrl();

  const legalDoc = await prisma.legalDocument.findFirst({
    where: { operationId, documentKind },
    select: { id: true },
  });

  const legalUiUrl = legalDoc
    ? `${appUrl}/platform/legal/contratos/${legalDoc.id}`
    : `${appUrl}/platform/legal/contratos`;

  const notifyParams = {
    operationId,
    documentKind,
    cloudinaryUrl,
    legalUiUrl,
  };

  const sellerPhone = process.env.SELLER_DEFAULT_PHONE ?? "34601257555";
  const comercialPhone = process.env.ALERT_WHATSAPP_TO;

  const errors: string[] = [];

  try {
    await sendContractDraftReadyNotification(sellerPhone, notifyParams);
    console.log(
      `[contrato-borrador] WA enviado al gestor/vendedor ${sellerPhone} para ${operationId}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`WA vendedor: ${msg}`);
    console.error(`[contrato-borrador] Error WA vendedor: ${msg}`);
  }

  if (comercialPhone) {
    try {
      await sendContractDraftReadyNotification(comercialPhone, notifyParams);
      console.log(
        `[contrato-borrador] WA enviado al comercial ${comercialPhone} para ${operationId}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`WA comercial: ${msg}`);
      console.error(`[contrato-borrador] Error WA comercial: ${msg}`);
    }
  }

  if (errors.length > 0) {
    console.warn(
      `[contrato-borrador] ${errors.length} error(es) de notificación, pero el handler continúa`,
    );
  }

  if (payload.demandId) {
    try {
      await updateDemandLeadStatus(payload.demandId, "EN_NEGOCIACION");
    } catch (err) {
      console.warn(
        `[contrato-borrador] Error actualizando leadStatus (directo): ${err instanceof Error ? err.message : err}`,
      );
    }
  } else {
    try {
      await updateLeadStatusByOperationId(payload.operacionId ?? operationId, "EN_NEGOCIACION");
    } catch (err) {
      console.warn(
        `[contrato-borrador] Error actualizando leadStatus: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  return { success: true };
}
