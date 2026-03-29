import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store/event-store";
import {
  sendSignatureReminderToSigner,
  sendSignatureSlaEscalation,
} from "@/lib/whatsapp/send";
import { getPublicAppUrl } from "@/lib/microsite/app-url";
import { SIGNATURE_PENDING_STATUSES } from "./status";

const REMINDER_DAYS = [1, 3, 5] as const;

export type ReminderAction =
  | { kind: "reminder"; day: number }
  | { kind: "escalation" }
  | { kind: "none" };

/**
 * Pure function: given elapsed days, last reminder sent, and SLA window,
 * returns which action the cron should take next.
 */
export function getNextReminderAction(
  daysSinceSent: number,
  lastReminderDay: number,
  slaDeadlineDays: number,
): ReminderAction {
  if (daysSinceSent >= slaDeadlineDays && lastReminderDay >= 5) {
    return { kind: "escalation" };
  }

  for (const day of REMINDER_DAYS) {
    if (daysSinceSent >= day && lastReminderDay < day) {
      return { kind: "reminder", day };
    }
  }

  if (daysSinceSent >= slaDeadlineDays) {
    return { kind: "escalation" };
  }

  return { kind: "none" };
}

export interface ScanResult {
  scanned: number;
  reminders: number;
  escalations: number;
  errors: number;
}

export async function scanAndSendSignatureReminders(): Promise<ScanResult> {
  const pending = await prisma.signatureRequest.findMany({
    where: {
      status: { in: SIGNATURE_PENDING_STATUSES },
      escalatedAt: null,
    },
    orderBy: { sentAt: "asc" },
  });

  const result: ScanResult = {
    scanned: pending.length,
    reminders: 0,
    escalations: 0,
    errors: 0,
  };

  const now = new Date();
  const appUrl = getPublicAppUrl();

  for (const req of pending) {
    const elapsed = now.getTime() - req.sentAt.getTime();
    const daysSinceSent = elapsed / (24 * 60 * 60 * 1000);

    const action = getNextReminderAction(
      daysSinceSent,
      req.lastReminderDay,
      req.slaDeadlineDays,
    );

    if (action.kind === "none") continue;

    try {
      if (action.kind === "reminder") {
        const phone = req.signerPhone;
        if (!phone) {
          console.log(
            `[signature-reminders] Skip reminder D+${action.day} for ${req.id}: no phone`,
          );
          continue;
        }

        await sendSignatureReminderToSigner(phone, {
          signerName: req.signerName,
          documentKind: req.documentKind,
          operationRef: req.operationId,
          signingUrl: req.signingUrl ?? "",
          reminderDay: action.day,
        });

        await prisma.signatureRequest.update({
          where: { id: req.id },
          data: { lastReminderDay: action.day },
        });

        await appendEvent({
          type: "FIRMA_RECORDATORIO_ENVIADO",
          aggregateType: "PROPERTY",
          aggregateId: req.propertyCode,
          payload: {
            signatureRequestId: req.id,
            operationId: req.operationId,
            reminderDay: action.day,
          },
        });

        result.reminders++;
        console.log(
          `[signature-reminders] Sent D+${action.day} reminder for ${req.id}`,
        );
      }

      if (action.kind === "escalation") {
        const trackingUrl = `${appUrl}/legal/contratos/${req.operationId}`;

        const comercial = await prisma.comercial.findFirst({
          where: { activo: true },
          select: { telefono: true },
        });
        const escalationPhone =
          process.env.ALERT_WHATSAPP_TO ?? comercial?.telefono;

        if (escalationPhone) {
          await sendSignatureSlaEscalation(escalationPhone, {
            operationRef: req.operationId,
            documentKind: req.documentKind,
            trackingUrl,
          });
        }

        await prisma.signatureRequest.update({
          where: { id: req.id },
          data: { escalatedAt: now },
        });

        await appendEvent({
          type: "FIRMA_SLA_ESCALADO",
          aggregateType: "PROPERTY",
          aggregateId: req.propertyCode,
          payload: {
            signatureRequestId: req.id,
            operationId: req.operationId,
            slaDeadlineDays: req.slaDeadlineDays,
            daysSinceSent: Math.floor(daysSinceSent),
          },
        });

        result.escalations++;
        console.log(
          `[signature-reminders] SLA escalation for ${req.id} (${Math.floor(daysSinceSent)} days)`,
        );
      }
    } catch (err) {
      result.errors++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[signature-reminders] Error processing ${req.id}: ${message}`,
      );
    }
  }

  return result;
}
