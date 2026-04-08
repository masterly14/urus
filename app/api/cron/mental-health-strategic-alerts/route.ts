import type { Prisma } from "@/app/generated/prisma/client";
import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/api/cron-auth";
import { prisma } from "@/lib/prisma";
import { alertGeneric } from "@/lib/alerts";
import { scanMentalHealthStrategicAlerts } from "@/lib/mental-health/strategic-feedback-scanner";

const TYPE_LABELS: Record<string, string> = {
  mh_energy_low: "Coach: energía baja sostenida",
  mh_bloqueo_recurrente: "Coach: bloqueo recurrente",
  mh_sobrecarga_uso: "Coach: uso intensivo",
};

/**
 * M12 — Capa 5: métricas agregadas del bot mental → alertas operativas (CEO).
 *
 * Ejecutar 2–3×/semana vía QStash (mismo patrón que /api/cron/dashboard-alerts).
 * Persiste en `dashboard_alerts` y notifica solo por `alertGeneric` (log + ALERT_WHATSAPP_TO).
 * No envía WhatsApp al comercial ni incluye texto de conversación.
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const scanResult = await scanMentalHealthStrategicAlerts();

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
        const typeLabel = TYPE_LABELS[alert.type] ?? alert.type;
        await alertGeneric(
          `M12 Coach: ${typeLabel} — ${alert.comercialNombre}`,
          alert.severity === "high" ? "critical" : "warning",
          {
            comercialId: alert.comercialId,
            comercialNombre: alert.comercialNombre,
            type: alert.type,
            metric: alert.metric,
            message: alert.message,
            details: alert.details,
          },
        );

        await prisma.dashboardAlert.update({
          where: { id: saved.id },
          data: { notifiedAt: new Date() },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        notifyErrors.push(`${saved.id}: ${msg}`);
        console.error(
          `[cron/mental-health-strategic-alerts] Error notificando ${saved.id}: ${msg}`,
        );
      }
    }

    console.log(
      `[cron/mental-health-strategic-alerts] comercialesConDatos=${scanResult.comercialesConDatos} ` +
        `energy=${scanResult.energyCount} bloqueo=${scanResult.bloqueoCount} sobrecarga=${scanResult.sobrecargaCount} ` +
        `dedup=${scanResult.deduplicatedCount} persisted=${persisted.length}`,
    );

    return NextResponse.json({
      ok: true,
      persisted: persisted.length,
      energyCount: scanResult.energyCount,
      bloqueoCount: scanResult.bloqueoCount,
      sobrecargaCount: scanResult.sobrecargaCount,
      deduplicatedCount: scanResult.deduplicatedCount,
      comercialesConDatos: scanResult.comercialesConDatos,
      notifyErrors: notifyErrors.length > 0 ? notifyErrors : undefined,
    });
  } catch (err) {
    console.error(
      "[cron/mental-health-strategic-alerts] Error:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "Error al escanear alertas estratégicas del coach" },
      { status: 500 },
    );
  }
}

export const maxDuration = 60;
