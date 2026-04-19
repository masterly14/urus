/**
 * Handler de CONTRATO_VERSIONADO.
 *
 * Se activa cuando el gestor revisa un contrato por voz (voice-apply):
 * el intérprete LangGraph aplica cambios, se regenera el DOCX y
 * voice-apply/route.ts emite CONTRATO_VERSIONADO con el nuevo
 * templateVersion, SHA-256 y URL de Cloudinary.
 *
 * Este handler:
 * 1. Actualiza LegalDocument con la nueva versión y URL.
 * 2. Notifica al gestor/comercial que hay nueva versión lista.
 */

import type { Event } from "@/types/domain";
import type { HandlerResult } from "./types";
import { prisma } from "@/lib/prisma";
import { getPublicAppUrl } from "@/lib/microsite/app-url";
import { sendContractDraftReadyNotification } from "@/lib/whatsapp/send";
import { emitManagementAlert } from "@/lib/notifications/emit";

interface ContratoVersionadoPayload {
  operationId: string;
  propertyCode: string;
  documentKind: string;
  previousTemplateVersion?: string | null;
  nextTemplateVersion: string;
  docxFileName: string;
  appliedSummaries: string[];
  docxSha256?: string;
  actorUserId?: string;
  cloudinary?: {
    publicId?: string;
    secureUrl?: string;
    bytes?: number;
  };
}

function parsePayload(raw: unknown): ContratoVersionadoPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (
    typeof p.operationId !== "string" ||
    typeof p.propertyCode !== "string" ||
    typeof p.documentKind !== "string" ||
    typeof p.nextTemplateVersion !== "string"
  ) {
    return null;
  }
  return {
    operationId: p.operationId,
    propertyCode: p.propertyCode,
    documentKind: p.documentKind,
    previousTemplateVersion:
      typeof p.previousTemplateVersion === "string"
        ? p.previousTemplateVersion
        : null,
    nextTemplateVersion: p.nextTemplateVersion,
    docxFileName:
      typeof p.docxFileName === "string" ? p.docxFileName : "",
    appliedSummaries: Array.isArray(p.appliedSummaries)
      ? (p.appliedSummaries as string[])
      : [],
    docxSha256:
      typeof p.docxSha256 === "string" ? p.docxSha256 : undefined,
    actorUserId:
      typeof p.actorUserId === "string" ? p.actorUserId : undefined,
    cloudinary:
      p.cloudinary && typeof p.cloudinary === "object"
        ? (p.cloudinary as ContratoVersionadoPayload["cloudinary"])
        : undefined,
  };
}

export async function handleContratoVersionado(
  event: Event,
): Promise<HandlerResult> {
  const payload = parsePayload(event.payload);
  if (!payload) {
    return {
      success: false,
      error: "CONTRATO_VERSIONADO: payload incompleto",
      permanent: true,
    };
  }

  const {
    operationId,
    documentKind,
    nextTemplateVersion,
    appliedSummaries,
    cloudinary,
  } = payload;

  console.log(
    `[consumer:contrato-versionado] operationId=${operationId} kind=${documentKind} version=${nextTemplateVersion} changes=${appliedSummaries.length}`,
  );

  const legalDoc = await prisma.legalDocument.findFirst({
    where: { operationId, documentKind },
    select: { id: true, status: true },
  });

  if (!legalDoc) {
    console.warn(
      `[consumer:contrato-versionado] LegalDocument no encontrado para ${operationId}/${documentKind}`,
    );
    return { success: true };
  }

  const cloudinaryUrl = cloudinary?.secureUrl;

  await prisma.legalDocument.update({
    where: { id: legalDoc.id },
    data: {
      templateVersion: nextTemplateVersion,
      ...(cloudinaryUrl ? { cloudinaryUrl } : {}),
      ...(legalDoc.status === "APPROVED" || legalDoc.status === "SENT_TO_SIGNATURE"
        ? {}
        : { status: "DRAFT" }),
    },
  });

  console.log(
    `[consumer:contrato-versionado] LegalDocument ${legalDoc.id} actualizado → templateVersion=${nextTemplateVersion}`,
  );

  const appUrl = getPublicAppUrl();
  const legalUiUrl = `${appUrl}/platform/legal/contratos/${legalDoc.id}`;

  const notifyParams = {
    operationId,
    documentKind,
    cloudinaryUrl: cloudinaryUrl ?? "",
    legalUiUrl,
  };

  const sellerPhone = process.env.SELLER_DEFAULT_PHONE ?? "34601257555";

  try {
    await sendContractDraftReadyNotification(sellerPhone, notifyParams);
    console.log(
      `[consumer:contrato-versionado] WA nueva versión enviado al gestor ${sellerPhone}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[consumer:contrato-versionado] Error WA gestor: ${msg}`,
    );
  }

  try {
    await emitManagementAlert({
      source: "legal",
      severity: "info",
      title: "Contrato versionado",
      description:
        `Operacion ${operationId} (${documentKind}) actualizada a version ${nextTemplateVersion}.\n` +
        `Panel: ${legalUiUrl}`,
    });
  } catch (err) {
    console.error(
      `[consumer:contrato-versionado] Error enviando notificación interna: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return { success: true };
}
