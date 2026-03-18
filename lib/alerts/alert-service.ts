import type {
  AlertPayload,
  DeadLetterAlertPayload,
  ThresholdAlertPayload,
  AlertConfig,
} from "./types";

function getConfig(): AlertConfig {
  const channels: AlertConfig["channels"] = ["log"];

  if (process.env.ALERT_WHATSAPP_TO) {
    channels.push("whatsapp");
  }

  return {
    channels,
    whatsappAlertTo: process.env.ALERT_WHATSAPP_TO,
  };
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

async function sendWhatsAppAlert(
  alert: AlertPayload,
  to: string,
): Promise<void> {
  try {
    const { sendTextMessage } = await import("@/lib/whatsapp/send");

    const emoji = alert.severity === "critical" ? "🔴" : "🟡";
    const lines = [
      `${emoji} *Alerta del sistema*`,
      ``,
      `*${alert.title}*`,
      `Severidad: ${alert.severity.toUpperCase()}`,
      ``,
      ...Object.entries(alert.details)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `• ${k}: ${String(v)}`),
      ``,
      `📅 ${alert.timestamp}`,
    ];

    await sendTextMessage(to, lines.join("\n"));
  } catch (err) {
    console.error(
      `[alert] Error enviando alerta WhatsApp: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function dispatch(alert: AlertPayload): Promise<void> {
  const config = getConfig();

  for (const channel of config.channels) {
    switch (channel) {
      case "log":
        logAlert(alert);
        break;
      case "whatsapp":
        if (config.whatsappAlertTo) {
          await sendWhatsAppAlert(alert, config.whatsappAlertTo);
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
