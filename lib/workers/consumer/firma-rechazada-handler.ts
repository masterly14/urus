/**
 * Handler para FIRMA_RECHAZADA.
 *
 * Cuando el firmante rechaza el documento vía POST /api/firma/{token}/decline,
 * el endpoint ya actualiza SignatureRequest → DECLINED y LegalDocument → DRAFT.
 * Este handler se encarga de:
 *
 * 1. Verificar idempotencia (status ya terminal → skip).
 * 2. Registrar DashboardAlert para visibilidad del equipo.
 * 3. Crear notificación interna para seguimiento en plataforma.
 */

import type { Event } from "@/types/domain";
import type { HandlerResult } from "./types";
import { prisma } from "@/lib/prisma";
import { getPublicAppUrl } from "@/lib/microsite/app-url";
import { emitManagementAlert } from "@/lib/notifications/emit";

interface FirmaRechazadaPayload {
  signatureRequestId: string;
  operationId: string;
  documentKind?: string;
  signerName?: string;
  reason?: string | null;
}

function parsePayload(raw: unknown): FirmaRechazadaPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (
    typeof p.signatureRequestId !== "string" ||
    typeof p.operationId !== "string"
  ) {
    return null;
  }
  return {
    signatureRequestId: p.signatureRequestId,
    operationId: p.operationId,
    documentKind: typeof p.documentKind === "string" ? p.documentKind : undefined,
    signerName: typeof p.signerName === "string" ? p.signerName : undefined,
    reason: typeof p.reason === "string" ? p.reason : null,
  };
}

export async function handleFirmaRechazada(
  event: Event,
): Promise<HandlerResult> {
  const payload = parsePayload(event.payload);
  if (!payload) {
    return {
      success: false,
      error: "FIRMA_RECHAZADA: payload incompleto (faltan signatureRequestId u operationId)",
      permanent: true,
    };
  }

  const { signatureRequestId, operationId, signerName, reason } = payload;

  console.log(
    `[consumer:firma-rechazada] signatureRequestId=${signatureRequestId} operationId=${operationId} signer=${signerName ?? "?"}`,
  );

  const sigReq = await prisma.signatureRequest.findUnique({
    where: { id: signatureRequestId },
    select: { status: true, documentKind: true },
  });

  if (!sigReq) {
    console.warn(
      `[consumer:firma-rechazada] SignatureRequest ${signatureRequestId} no encontrada`,
    );
    return { success: true };
  }

  if (sigReq.status !== "DECLINED") {
    console.log(
      `[consumer:firma-rechazada] SignatureRequest ${signatureRequestId} status=${sigReq.status}, skip (esperado DECLINED)`,
    );
    return { success: true };
  }

  const legalDoc = await prisma.legalDocument.findUnique({
    where: { signatureRequestId },
    select: { id: true },
  });

  try {
    await prisma.dashboardAlert.create({
      data: {
        comercialId: "system",
        comercialNombre: "Sistema",
        type: "FIRMA_DECLINED",
        severity: "HIGH",
        metric: "firma_rechazada",
        message: `Firma rechazada: operación ${operationId} — firmante ${signerName ?? "desconocido"}${reason ? ` (motivo: ${reason})` : ""}`,
        currentValue: null,
        threshold: null,
        details: {
          signatureRequestId,
          operationId,
          signerName,
          reason,
          eventId: event.id,
        },
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[consumer:firma-rechazada] No se pudo crear DashboardAlert: ${msg}`,
    );
  }

  const appUrl = getPublicAppUrl();
  const legalDocUrl = legalDoc
    ? `${appUrl}/platform/legal/contratos/${legalDoc.id}`
    : `${appUrl}/platform/legal/contratos`;

  try {
    await emitManagementAlert({
      source: "legal",
      severity: "warning",
      title: "Firma rechazada",
      description:
        `Operacion ${operationId} (${payload.documentKind ?? sigReq.documentKind}) rechazada por ${signerName ?? "Firmante"}.\n` +
        `${reason ? `Motivo: ${reason}\n` : ""}` +
        `Panel: ${legalDocUrl}`,
    });
  } catch (err) {
    console.error(
      `[consumer:firma-rechazada] Error emitiendo notificación interna: ${err instanceof Error ? err.message : err}`,
    );
  }

  console.log(
    `[consumer:firma-rechazada] Procesado: alert creada, notificación interna emitida`,
  );

  return { success: true };
}
