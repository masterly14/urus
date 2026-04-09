import { runWithObservabilityContext } from "./context";
import { createLogger, ensureObservabilityConsoleInstalled } from "./logger";
import { persistExecutionMetric } from "./persistence";
import type { ExecutionMetricRecord, ObservabilityContext } from "./types";

export function runWithWorkerObservability<T>(
  context: Omit<ObservabilityContext, "scope">,
  callback: () => T,
): T {
  ensureObservabilityConsoleInstalled();
  return runWithObservabilityContext({ ...context, scope: "worker" }, callback);
}

export function createWorkerLogger(
  context: Omit<ObservabilityContext, "scope">,
) {
  ensureObservabilityConsoleInstalled();
  return createLogger({ ...context, scope: "worker" });
}

export async function persistWorkerExecutionMetric(
  metric: Omit<ExecutionMetricRecord, "scope">,
): Promise<void> {
  await persistExecutionMetric({ ...metric, scope: "worker" });
}
