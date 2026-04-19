import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { isQstashAuthorized } from "@/lib/api/cron-auth";
import { prisma } from "@/lib/prisma";
import {
  scanMentalHealthAlerts,
  type MentalHealthAlertCandidate,
} from "@/lib/dashboard/mental-health/alert-scanner";
import { alertGeneric } from "@/lib/alerts";
import { withObservedRoute } from "@/lib/observability";


/**
 * Cron de alertas de salud mental — Capa 5 M12.
 * Ejecutar semanalmente (lunes ~09:30) via Upstash QStash.
 *
 * Detecta patrones de riesgo operativo sobre MentalHealthSession:
 *   - energy_drop:      ≥N sesiones con nivelEnergia ≤ 2 en 14 días
 *   - recurrent_block:  ≥N sesiones en flujo 'bloqueo' en 14 días
 *   - overload:         ≥N sesiones con nivelEnergia ≤ 3 en 7 días
 *
 * Las alertas se persisten en `dashboard_alerts` y se notifican al CEO
 * vía alertGeneric. No se exponen conversaciones individuales.
 */
const postHandler = async (request: Request) => {
  if (!(await isQstashAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const scanResult = await scanMentalHealthAlerts();

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
        await notifyMentalHealthAlert(alert, saved.id);
        await prisma.dashboardAlert.update({
          where: { id: saved.id },
          data: { notifiedAt: new Date() },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        notifyErrors.push(`${saved.id}: ${msg}`);
        console.error(
          `[cron/mental-health-alerts] Error notificando ${saved.id}: ${msg}`,
        );
      }
    }

    console.log(
      `[cron/mental-health-alerts] scan: energyDrop=${scanResult.energyDropCount} recurrentBlock=${scanResult.recurrentBlockCount} overload=${scanResult.overloadCount} dedup=${scanResult.deduplicatedCount} persisted=${persisted.length}`,
    );

    return NextResponse.json({
      ok: true,
      persisted: persisted.length,
      energyDropCount: scanResult.energyDropCount,
      recurrentBlockCount: scanResult.recurrentBlockCount,
      overloadCount: scanResult.overloadCount,
      deduplicatedCount: scanResult.deduplicatedCount,
      notifyErrors: notifyErrors.length > 0 ? notifyErrors : undefined,
    });
  } catch (err) {
    console.error(
      "[cron/mental-health-alerts] Error:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "Error al escanear alertas de salud mental" },
      { status: 500 },
    );
  }
}

export const POST = withObservedRoute({ method: "POST", route: "/api/cron/mental-health-alerts" }, postHandler);

export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Notificación al CEO vía alertGeneric
// ---------------------------------------------------------------------------

const SEVERITY_LABEL: Record<string, string> = {
  high: "ALTO",
  medium: "MEDIO",
  low: "BAJO",
};

const TYPE_LABELS: Record<string, string> = {
  energy_drop: "Caída de energía prolongada",
  recurrent_block: "Bloqueo emocional recurrente",
  overload: "Sobrecarga operativa",
};

async function notifyMentalHealthAlert(
  alert: MentalHealthAlertCandidate,
  alertId: string,
): Promise<void> {
  const typeLabel = TYPE_LABELS[alert.type] ?? alert.type;
  const severityLabel = SEVERITY_LABEL[alert.severity] ?? alert.severity.toUpperCase();

  await alertGeneric(
    `Capital Humano: ${typeLabel} — ${alert.comercialNombre}`,
    alert.severity === "high" ? "critical" : "warning",
    {
      alertId,
      comercialId: alert.comercialId,
      comercialNombre: alert.comercialNombre,
      type: alert.type,
      typeLabel,
      severity: alert.severity,
      severityLabel,
      metric: alert.metric,
      message: alert.message,
      currentValue: alert.currentValue,
      threshold: alert.threshold,
      ...alert.details,
    },
  );
}
