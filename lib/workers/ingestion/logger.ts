import {
  createWorkerLogger,
  type LogLevel,
  type ObservabilityLogRecord as LogEntry,
  type StructuredLogger,
} from "@/lib/observability";

export type { LogLevel, LogEntry };
export type WorkerLogger = StructuredLogger;

/** Logger base para el worker de propiedades */
export const propertiesLogger = createWorkerLogger({
  source: "worker",
  operation: "ingestion:properties",
  workerName: "ingestion:properties",
});

/** Logger base para el worker de demandas */
export const demandsLogger = createWorkerLogger({
  source: "worker",
  operation: "ingestion:demands",
  workerName: "ingestion:demands",
});
