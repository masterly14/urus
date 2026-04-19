import type {
  AlertPayload,
  DeadLetterAlertPayload,
  ThresholdAlertPayload,
  AlertConfig,
} from "./types";

function getConfig(): AlertConfig {
  return { channels: ["log", "management"] };
}

function logAlert(alert: AlertPayload): void {
  const prefix =
    alert.severity === "critical" ? "🔴 CRITICAL" : "🟡 WARNING";

  console.error(
    JSON.stringify({
      level: "alert",
      severity: alert.severity,
      title: alert.title,
      ...alert.details,
      timestamp: alert.timestamp,
    }),
  );
  console.error(`[alert] ${prefix}: ${alert.title}`);
}

function buildAlertDescription(alert: AlertPayload): string {
  const detailLines = Object.entries(alert.details)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}: ${String(v)}`);
  const suffix = detailLines.length ? `\n${detailLines.join("\n")}` : "";
  return `Severidad: ${alert.severity.toUpperCase()}\nTimestamp: ${alert.timestamp}${suffix}`;
}

async function dispatch(alert: AlertPayload): Promise<void> {
  const config = getConfig();

  for (const channel of config.channels) {
    switch (channel) {
      case "log":
        logAlert(alert);
        break;
      case "management":
        try {
          const { emitManagementAlert } = await import("@/lib/notifications/emit");
          await emitManagementAlert({
            source: "alert-system",
            severity: alert.severity,
            title: alert.title,
            description: buildAlertDescription(alert),
          });
        } catch (err) {
          console.error(
            `[alert] Error emitiendo notificación interna: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        break;
    }
  }
}

export async function alertDeadLetter(
  params: Omit<DeadLetterAlertPayload, "title" | "severity" | "timestamp">,
): Promise<void> {
  const alert: DeadLetterAlertPayload = {
    ...params,
    title: `Job ${params.jobType} movido a Dead-Letter Queue`,
    severity: "critical",
    timestamp: new Date().toISOString(),
    details: {
      jobId: params.jobId,
      jobType: params.jobType,
      attempts: params.attempts,
      lastError: params.lastError,
      ...(params.operation ? { operation: params.operation } : {}),
    },
  };

  await dispatch(alert);
}

export async function alertThreshold(
  params: Omit<ThresholdAlertPayload, "title" | "severity" | "timestamp"> & {
    title: string;
    severity: ThresholdAlertPayload["severity"];
  },
): Promise<void> {
  const alert: ThresholdAlertPayload = {
    ...params,
    timestamp: new Date().toISOString(),
    details: {
      metric: params.metric,
      currentValue: params.currentValue,
      threshold: params.threshold,
    },
  };

  await dispatch(alert);
}

export async function alertGeneric(
  title: string,
  severity: AlertPayload["severity"],
  details: Record<string, unknown>,
): Promise<void> {
  await dispatch({
    title,
    severity,
    timestamp: new Date().toISOString(),
    details,
  });
}
