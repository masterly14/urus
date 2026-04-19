import { getObservabilityContext } from "./context";
import { persistObservabilityLog } from "./persistence";
import type {
  LogLevel,
  ObservabilityContext,
  ObservabilityLogRecord,
} from "./types";

type ConsoleMethod = (...data: unknown[]) => void;

const originalConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: (console.debug ?? console.log).bind(console),
};

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let consoleInstalled = false;
let internalWrite = false;

function getMinLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL;
  if (
    envLevel === "debug" ||
    envLevel === "info" ||
    envLevel === "warn" ||
    envLevel === "error"
  ) {
    return envLevel;
  }
  return "info";
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[getMinLevel()];
}

function shouldJsonLogs(): boolean {
  if (process.env.LOG_FORMAT === "json") return true;
  if (process.env.LOG_FORMAT === "pretty") return false;
  return process.env.NODE_ENV === "production";
}

function safeSerialize(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, currentValue) => {
      if (typeof currentValue === "bigint") {
        return currentValue.toString();
      }
      if (currentValue instanceof Error) {
        return {
          name: currentValue.name,
          message: currentValue.message,
          stack: currentValue.stack,
        };
      }
      return currentValue;
    });
  } catch {
    return String(value);
  }
}

function formatPretty(record: ObservabilityLogRecord): string {
  const workerPart = record.workerName ?? record.source;
  const requestPart = record.requestId ? ` request=${record.requestId.slice(0, 8)}` : "";
  const cyclePart =
    record.context?.cycleId && typeof record.context.cycleId === "string"
      ? ` cycle=${record.context.cycleId.slice(0, 8)}`
      : "";
  const durationPart = record.durationMs != null ? ` [${record.durationMs}ms]` : "";
  const locationPart = record.route
    ? ` ${record.method ?? "REQ"} ${record.route}`
    : ` ${record.operation}`;

  let line =
    `[${record.timestamp}] [${record.level.toUpperCase()}]` +
    ` [${workerPart}]${requestPart}${cyclePart}${durationPart}${locationPart} ${record.message}`;

  if (record.context && Object.keys(record.context).length > 0) {
    line += ` ${safeSerialize(record.context)}`;
  }
  if (record.errorMessage) {
    line += ` error="${record.errorMessage}"`;
  }
  if (record.errorStack && process.env.LOG_STACK !== "false") {
    line += `\n${record.errorStack}`;
  }

  return line;
}

function getConsoleMethod(level: LogLevel): ConsoleMethod {
  if (level === "error") return originalConsole.error;
  if (level === "warn") return originalConsole.warn;
  if (level === "debug") return originalConsole.debug;
  return originalConsole.log;
}

function writeRawLog(record: ObservabilityLogRecord): void {
  internalWrite = true;
  try {
    const line = shouldJsonLogs()
      ? safeSerialize(record)
      : formatPretty(record);
    getConsoleMethod(record.level)(line);
  } finally {
    internalWrite = false;
  }
}

function normalizeMessage(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) return arg.message;
  return safeSerialize(arg);
}

function normalizeData(args: unknown[]): Record<string, unknown> | undefined {
  if (args.length === 0) return undefined;

  if (args.length === 1 && args[0] && typeof args[0] === "object") {
    return { payload: args[0] as Record<string, unknown> };
  }

  return {
    args: args.map((arg) => {
      if (arg instanceof Error) {
        return {
          name: arg.name,
          message: arg.message,
          stack: arg.stack,
        };
      }
      return arg;
    }),
  };
}

function emitObservedLog(
  level: LogLevel,
  message: string,
  context: ObservabilityContext,
  data?: Record<string, unknown>,
  err?: unknown,
  options?: { durationMs?: number; statusCode?: number },
): void {
  if (!shouldLog(level)) return;

  const errorMessage =
    err instanceof Error ? err.message : err != null ? String(err) : undefined;
  const errorStack = err instanceof Error ? err.stack : undefined;

  const record: ObservabilityLogRecord = {
    timestamp: new Date().toISOString(),
    level,
    ...context,
    message,
    durationMs: options?.durationMs,
    statusCode: options?.statusCode,
    errorMessage,
    errorStack,
    context: {
      ...(context.component ? { component: context.component } : {}),
      ...(context.cycleId ? { cycleId: context.cycleId } : {}),
      ...(data ?? {}),
    },
  };

  writeRawLog(record);
  void persistObservabilityLog(record);
}

export interface StructuredLogger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, err?: unknown, data?: Record<string, unknown>): void;
  phase(
    component: string,
    durationMs: number,
    data?: Record<string, unknown>,
  ): void;
  child(context: Partial<ObservabilityContext>): StructuredLogger;
}

function mergeContext(
  base: ObservabilityContext,
  extra?: Partial<ObservabilityContext>,
): ObservabilityContext {
  return {
    ...base,
    ...extra,
    scope: extra?.scope ?? base.scope,
    source: extra?.source ?? base.source,
    operation: extra?.operation ?? base.operation,
  };
}

export function createLogger(baseContext: ObservabilityContext): StructuredLogger {
  return {
    debug: (message, data) => emitObservedLog("debug", message, baseContext, data),
    info: (message, data) => emitObservedLog("info", message, baseContext, data),
    warn: (message, data) => emitObservedLog("warn", message, baseContext, data),
    error: (message, err, data) =>
      emitObservedLog("error", message, baseContext, data, err),
    phase: (component, durationMs, data) =>
      emitObservedLog(
        "info",
        `Fase "${component}" completada`,
        { ...baseContext, component },
        data,
        undefined,
        { durationMs },
      ),
    child: (context) => createLogger(mergeContext(baseContext, context)),
  };
}

export function ensureObservabilityConsoleInstalled(): void {
  if (consoleInstalled) return;
  consoleInstalled = true;

  const install =
    (level: LogLevel, fallback: ConsoleMethod) =>
    (...args: unknown[]) => {
      if (internalWrite) {
        fallback(...args);
        return;
      }

      const activeContext = getObservabilityContext();
      if (!activeContext) {
        fallback(...args);
        return;
      }

      const [first, ...rest] = args;
      const message = normalizeMessage(first);
      const data = normalizeData(rest);
      const err =
        first instanceof Error
          ? first
          : rest.find((arg) => arg instanceof Error);

      emitObservedLog(level, message, activeContext, data, err);
    };

  console.log = install("info", originalConsole.log);
  console.warn = install("warn", originalConsole.warn);
  console.error = install("error", originalConsole.error);
  console.debug = install("debug", originalConsole.debug);
}
