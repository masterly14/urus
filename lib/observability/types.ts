export type LogLevel = "debug" | "info" | "warn" | "error";

export type ObservabilityScope = "api" | "worker";

export interface ObservabilityContext {
  scope: ObservabilityScope;
  source: string;
  operation: string;
  component?: string;
  cycleId?: string;
  route?: string;
  method?: string;
  requestId?: string;
  correlationId?: string;
  workerId?: string;
  workerName?: string;
  jobId?: string;
  jobType?: string;
  eventId?: string;
  eventType?: string;
}

export interface ObservabilityLogRecord extends ObservabilityContext {
  timestamp: string;
  level: LogLevel;
  message: string;
  statusCode?: number;
  durationMs?: number;
  errorMessage?: string;
  errorStack?: string;
  context?: Record<string, unknown>;
}

export interface ExecutionMetricRecord extends ObservabilityContext {
  name: string;
  success: boolean;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  throughputCount?: number;
  statusCode?: number;
  errorMessage?: string;
  errorCode?: string;
  context?: Record<string, unknown>;
}
