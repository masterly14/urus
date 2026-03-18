import type { JobType } from "@/app/generated/prisma/client";

export type AlertSeverity = "warning" | "critical";

export type AlertChannel = "log" | "whatsapp";

export interface AlertPayload {
  title: string;
  severity: AlertSeverity;
  details: Record<string, unknown>;
  timestamp: string;
}

export interface DeadLetterAlertPayload extends AlertPayload {
  jobId: string;
  jobType: JobType;
  attempts: number;
  lastError: string;
  operation?: string;
}

export interface ThresholdAlertPayload extends AlertPayload {
  metric: string;
  currentValue: number;
  threshold: number;
}

export interface AlertConfig {
  channels: AlertChannel[];
  whatsappAlertTo?: string;
}
