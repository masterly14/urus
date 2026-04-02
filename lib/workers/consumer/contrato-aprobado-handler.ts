/**
 * Handler de CONTRATO_APROBADO.
 *
 * Automatiza server-side la transición aprobación → firma digital:
 *
 * 1. Lee el LegalDocument (ya en status APPROVED por /api/contracts/approve).
 * 2. Resuelve las parties del documento como signers.
 * 3. Encola un job INITIATE_SIGNATURE_REQUEST que invoca la lógica
 *    de POST /api/contracts/sign internamente.
 *
 * Esto garantiza que la firma se inicia aunque el front-end no la dispare
 * (resiliencia server-side).
 */

import type { Event } from "@/types/domain";
import type { EnqueueJobInput } from "@/lib/job-queue/types";
import type { HandlerResult } from "./types";
import { prisma } from "@/lib/prisma";

interface ContratoAprobadoPayload {
  operationId: string;
  documentKind: string;
  legalDocumentId: string;
  templateVersion?: string;
}

function parsePayload(raw: unknown): ContratoAprobadoPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (
    typeof p.operationId !== "string" ||
    typeof p.documentKind !== "string" ||
    typeof p.legalDocumentId !== "string"
  ) {
    return null;
  }
  return {
    operationId: p.operationId,
    documentKind: p.documentKind,
    legalDocumentId: p.legalDocumentId,
    templateVersion:
      typeof p.templateVersion === "string" ? p.templateVersion : undefined,
  };
}

export async function handleContratoAprobado(
  event: Event,
): Promise<HandlerResult> {
  const payload = parsePayload(event.payload);
  if (!payload) {
    return {
      success: false,
      error: "CONTRATO_APROBADO: payload incompleto",
      permanent: true,
    };
  }

  const { operationId, documentKind, legalDocumentId, templateVersion } =
    payload;

  console.log(
    `[consumer:contrato-aprobado] operationId=${operationId} documentKind=${documentKind} legalDocId=${legalDocumentId}`,
  );

  const legalDoc = await prisma.legalDocument.findUnique({
    where: { id: legalDocumentId },
    include: { parties: true },
  });

  if (!legalDoc) {
    return {
      success: false,
      error: `LegalDocument ${legalDocumentId} no encontrado`,
      permanent: true,
    };
  }

  if (legalDoc.signatureRequestId) {
    console.log(
      `[consumer:contrato-aprobado] LegalDocument ${legalDocumentId} ya tiene signatureRequestId=${legalDoc.signatureRequestId} — firma ya iniciada, skip`,
    );
    return { success: true };
  }

  if (legalDoc.status !== "APPROVED") {
    console.log(
      `[consumer:contrato-aprobado] LegalDocument ${legalDocumentId} en status=${legalDoc.status} (esperado APPROVED) — skip`,
    );
    return { success: true };
  }

  if (!legalDoc.cloudinaryUrl) {
    console.warn(
      `[consumer:contrato-aprobado] LegalDocument ${legalDocumentId} sin cloudinaryUrl — no se puede iniciar firma`,
    );
    return { success: true };
  }

  const signers = legalDoc.parties
    .filter((p) => p.email)
    .map((p) => ({
      name: p.fullName,
      email: p.email!,
      phone: p.phone ?? undefined,
      role: p.role,
    }));

  if (signers.length === 0) {
    console.warn(
      `[consumer:contrato-aprobado] LegalDocument ${legalDocumentId} sin parties con email — firma no se puede iniciar automáticamente`,
    );
    return { success: true };
  }

  const followUpJobs: EnqueueJobInput[] = [
    {
      type: "SEND_SIGNATURE_REQUEST",
      payload: {
        operationId: legalDoc.operationId,
        propertyCode: legalDoc.propertyCode,
        documentKind: legalDoc.documentKind,
        templateVersion: templateVersion ?? legalDoc.templateVersion,
        cloudinaryUrl: legalDoc.cloudinaryUrl,
        signers,
        legalDocumentId: legalDoc.id,
      },
      idempotencyKey: `send_signature_request:${legalDoc.id}`,
      sourceEventId: event.id,
    },
  ];

  console.log(
    `[consumer:contrato-aprobado] Encolando SEND_SIGNATURE_REQUEST para ${legalDoc.id} con ${signers.length} firmante(s)`,
  );

  return { success: true, followUpJobs };
}
