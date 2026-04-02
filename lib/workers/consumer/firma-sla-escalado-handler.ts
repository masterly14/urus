/**
 * Handler unificado para FIRMA_SLA_ESCALADO (y FIRMA_EXPIRADA como alias).
 *
 * Cuando el reminder-scanner detecta que el SLA de firma se ha incumplido
 * (5 días sin firma), emite FIRMA_SLA_ESCALADO. El WhatsApp de escalado
 * al comercial/gestor ya lo envía el scanner; este handler se encarga del
 * cierre administrativo:
 *
 * 1. Marca SignatureRequest.status → EXPIRED + expiredAt.
 * 2. Marca LegalDocument.status → EXPIRED.
 * 3. Registra en DashboardAlert para visibilidad.
 */

import type { Event } from "@/types/domain";
import type { HandlerResult } from "./types";
import { prisma } from "@/lib/prisma";

interface FirmaSlaEscaladoPayload {
  signatureRequestId: string;
  operationId: string;
  slaDeadlineDays?: number;
  daysSinceSent?: number;
}

function parsePayload(raw: unknown): FirmaSlaEscaladoPayload | null {
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
    slaDeadlineDays:
      typeof p.slaDeadlineDays === "number" ? p.slaDeadlineDays : undefined,
    daysSinceSent:
      typeof p.daysSinceSent === "number" ? p.daysSinceSent : undefined,
  };
}

export async function handleFirmaSlaEscalado(
  event: Event,
): Promise<HandlerResult> {
  const payload = parsePayload(event.payload);
  if (!payload) {
    return {
      success: false,
      error: `${event.type}: payload incompleto`,
      permanent: true,
    };
  }

  const { signatureRequestId, operationId, daysSinceSent } = payload;

  console.log(
    `[consumer:firma-sla] ${event.type} signatureRequestId=${signatureRequestId} operationId=${operationId} daysSinceSent=${daysSinceSent ?? "?"}`,
  );

  const sigReq = await prisma.signatureRequest.findUnique({
    where: { id: signatureRequestId },
    select: { status: true, expiredAt: true },
  });

  if (!sigReq) {
    console.warn(
      `[consumer:firma-sla] SignatureRequest ${signatureRequestId} no encontrada`,
    );
    return { success: true };
  }

  const terminalStatuses = ["COMPLETED", "DECLINED", "EXPIRED", "CANCELED"];
  if (terminalStatuses.includes(sigReq.status)) {
    console.log(
      `[consumer:firma-sla] SignatureRequest ${signatureRequestId} ya en status terminal (${sigReq.status}), skip`,
    );
    return { success: true };
  }

  const now = new Date();

  await prisma.signatureRequest.update({
    where: { id: signatureRequestId },
    data: {
      status: "EXPIRED",
      expiredAt: now,
    },
  });

  const legalDoc = await prisma.legalDocument.findUnique({
    where: { signatureRequestId },
    select: { id: true, status: true },
  });

  if (legalDoc && legalDoc.status !== "SIGNED") {
    await prisma.legalDocument.update({
      where: { id: legalDoc.id },
      data: { status: "EXPIRED" },
    });
  }

  try {
    await prisma.dashboardAlert.create({
      data: {
        comercialId: "system",
        comercialNombre: "Sistema",
        type: "FIRMA_SLA_BREACH",
        severity: "HIGH",
        metric: "firma_sla_days",
        message: `Firma expirada: operación ${operationId} sin firma tras ${daysSinceSent ?? "?"} días`,
        currentValue: daysSinceSent ?? null,
        threshold: payload.slaDeadlineDays ?? 5,
        details: {
          signatureRequestId,
          operationId,
          daysSinceSent,
          eventId: event.id,
        },
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[consumer:firma-sla] No se pudo crear DashboardAlert: ${msg}`,
    );
  }

  console.log(
    `[consumer:firma-sla] SignatureRequest ${signatureRequestId} → EXPIRED, LegalDocument ${legalDoc?.id ?? "N/A"} → EXPIRED`,
  );

  return { success: true };
}
