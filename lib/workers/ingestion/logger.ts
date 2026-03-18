/**
 * Logger estructurado para workers de ingesta.
 *
 * En producción (NODE_ENV=production o LOG_FORMAT=json) emite JSON newline-delimited.
 * En desarrollo emite texto legible con colores por nivel.
 *
 * Variables de entorno:
 *   LOG_LEVEL   — Nivel mínimo: "debug" | "info" | "warn" | "error"  (default: "info")
 *   LOG_FORMAT  — Forzar formato: "json" | "pretty"                   (default: auto)
 *   LOG_STACK   — Incluir stack en errores: "true" | "false"          (default: "true")
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  worker: string;
  cycleId?: string;
  component?: string;
  message: string;
  data?: Record<string, unknown>;
  error?: string;
  stack?: string;
  durationMs?: number;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getMinLevel(): LogLevel {
  const env = process.env.LOG_LEVEL;
  if (env && env in LEVEL_PRIORITY) return env as LogLevel;
  return "info";
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[getMinLevel()];
}

function isJsonMode(): boolean {
  if (process.env.LOG_FORMAT === "json") return true;
  if (process.env.LOG_FORMAT === "pretty") return false;
  return process.env.NODE_ENV === "production";
}

function formatPretty(entry: LogEntry): string {
  const LEVEL_LABELS: Record<LogLevel, string> = {
    debug: "DEBUG",
    info: "INFO ",
    warn: "WARN ",
    error: "ERROR",
  };

  const label = LEVEL_LABELS[entry.level];
  const workerPart = entry.component
    ? `${entry.worker}:${entry.component}`
    : entry.worker;
  const cycleStr = entry.cycleId
    ? ` cycle=${entry.cycleId.slice(0, 8)}`
    : "";
  const durationStr = entry.durationMs != null
    ? ` [${entry.durationMs}ms]`
    : "";

  let line = `[${entry.timestamp}] [${label}] [${workerPart}]${cycleStr}${durationStr} ${entry.message}`;

  if (entry.data && Object.keys(entry.data).length > 0) {
    line += `  ${JSON.stringify(entry.data)}`;
  }
  if (entry.error) {
    line += `  error="${entry.error}"`;
  }
  if (
    entry.stack &&
    entry.level === "error" &&
    process.env.LOG_STACK !== "false"
  ) {
    line += `\n${entry.stack}`;
  }

  return line;
}

function emit(entry: LogEntry): void {
  if (!shouldLog(entry.level)) return;

  const line = isJsonMode()
    ? JSON.stringify(entry)
    : formatPretty(entry);

  if (entry.level === "error") {
    console.error(line);
  } else if (entry.level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export interface WorkerLogger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(
    message: string,
    err?: unknown,
    data?: Record<string, unknown>,
  ): void;
  /** Loguea el fin de una fase con su duración */
  phase(
    component: string,
    durationMs: number,
    data?: Record<string, unknown>,
  ): void;
  /** Devuelve un logger hijo con contexto adicional heredado */
  child(context: { cycleId?: string; component?: string }): WorkerLogger;
}

function createLogger(
  worker: string,
  context: { cycleId?: string; component?: string } = {},
): WorkerLogger {
  function log(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
    err?: unknown,
    durationMs?: number,
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      worker,
      ...context,
      message,
    };

    if (data && Object.keys(data).length > 0) {
      entry.data = data;
    }
    if (durationMs != null) {
      entry.durationMs = durationMs;
    }
    if (err != null) {
      if (err instanceof Error) {
        entry.error = err.message;
        if (err.stack) entry.stack = err.stack;
      } else {
        entry.error = String(err);
      }
    }

    emit(entry);
  }

  return {
    debug: (msg, data) => log("debug", msg, data),
    info: (msg, data) => log("info", msg, data),
    warn: (msg, data) => log("warn", msg, data),
    error: (msg, err, data) => log("error", msg, data, err),
    phase: (component, durationMs, data) =>
      log(
        "info",
        `Fase "${component}" completada`,
        { component, ...data },
        undefined,
        durationMs,
      ),
    child: (childContext) =>
      createLogger(worker, { ...context, ...childContext }),
  };
}

/** Logger base para el worker de propiedades */
export const propertiesLogger = createLogger("ingestion:properties");
/** Logger base para el worker de demandas */
export const demandsLogger = createLogger("ingestion:demands");
