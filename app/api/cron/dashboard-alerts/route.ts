import type { Prisma } from "@/app/generated/prisma/client";
import { NextResponse } from "next/server";
import { isQstashAuthorized } from "@/lib/api/cron-auth";
import { prisma } from "@/lib/prisma";
import { scanDashboardAlerts, type AlertCandidate } from "@/lib/dashboard/comercial/alert-scanner";
import { alertGeneric } from "@/lib/alerts";
import { sendTextMessage } from "@/lib/whatsapp/send";
import { withObservedRoute } from "@/lib/observability";


/**
 * Cron de alertas del dashboard comercial (M10).
 * Ejecutar semanalmente (lunes ~09:00) via Upstash QStash.
 *
 * Detecta: caída de 2 semanas, SLAs incumplidos, desviación vs media.
 * Persiste alertas en `dashboard_alerts` y notifica vía WhatsApp.
 */
const postHandler = async (request: Request) => {
  if (!(await isQstashAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const scanResult = await scanDashboardAlerts();

    const persisted: string[] = [];
    const notifyErrors: string[] = [];

    for (const alert of scanResult.alerts) {
      const saved = await prisma.dashboardAlert.create({
        data: {
          comercialId: alert.comercialId,
          comercialNombre: alert.comercialNombre,
          type: alert.type,
          severity: alert.severity,
          metric: alert.metric,
          message: alert.message,
          currentValue: alert.currentValue,
          baselineValue: alert.baselineValue,
          threshold: alert.threshold,
          details: alert.details as Prisma.InputJsonValue,
        },
      });

      persisted.push(saved.id);

      try {
        await notifyAlert(alert, saved.id);
        await prisma.dashboardAlert.update({
          where: { id: saved.id },
          data: { notifiedAt: new Date() },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        notifyErrors.push(`${saved.id}: ${msg}`);
        console.error(`[cron/dashboard-alerts] Error notificando ${saved.id}: ${msg}`);
      }
    }

    console.log(
      `[cron/dashboard-alerts] scan: drops=${scanResult.dropCount} sla=${scanResult.slaCount} deviation=${scanResult.deviationCount} dedup=${scanResult.deduplicatedCount} persisted=${persisted.length}`,
    );

    return NextResponse.json({
      ok: true,
      persisted: persisted.length,
      dropCount: scanResult.dropCount,
      slaCount: scanResult.slaCount,
      deviationCount: scanResult.deviationCount,
      deduplicatedCount: scanResult.deduplicatedCount,
      notifyErrors: notifyErrors.length > 0 ? notifyErrors : undefined,
    });
  } catch (err) {
    console.error(
      "[cron/dashboard-alerts] Error:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "Error al escanear alertas del dashboard" },
      { status: 500 },
    );
  }
}

export const POST = withObservedRoute({ method: "POST", route: "/api/cron/dashboard-alerts" }, postHandler);

export const maxDuration = 60;

// ---------------------------------------------------------------------------
// WhatsApp notifications
// ---------------------------------------------------------------------------

const SEVERITY_EMOJI: Record<string, string> = {
  high: "🔴",
  medium: "🟡",
  low: "🔵",
};

const TYPE_LABELS: Record<string, string> = {
  drop: "Caída de rendimiento",
  sla_breach: "SLA incumplido",
  deviation: "Desviación vs media",
};

async function notifyAlert(alert: AlertCandidate, alertId: string): Promise<void> {
  const emoji = SEVERITY_EMOJI[alert.severity] ?? "⚪";
  const typeLabel = TYPE_LABELS[alert.type] ?? alert.type;

  const lines = [
    `${emoji} *Alerta Dashboard Comercial*`,
    ``,
    `*${typeLabel}*`,
    `Comercial: ${alert.comercialNombre}`,
    ``,
    alert.message,
    ``,
    `Severidad: ${alert.severity.toUpperCase()}`,
    `ID: ${alertId}`,
  ];
  const text = lines.join("\n");

  await alertGeneric(
    `Dashboard: ${typeLabel} — ${alert.comercialNombre}`,
    alert.severity === "high" ? "critical" : "warning",
    {
      comercialId: alert.comercialId,
      comercialNombre: alert.comercialNombre,
      type: alert.type,
      metric: alert.metric,
      message: alert.message,
    },
  );

  const comercial = await prisma.comercial.findUnique({
    where: { id: alert.comercialId },
    select: { telefono: true },
  });

  if (comercial?.telefono) {
    try {
      await sendTextMessage(comercial.telefono, text);
    } catch (err) {
      console.error(
        `[cron/dashboard-alerts] Error WA al comercial ${alert.comercialId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
