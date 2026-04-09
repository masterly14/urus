import { AsyncLocalStorage } from "node:async_hooks";
import type { ObservabilityContext } from "./types";

const observabilityStorage = new AsyncLocalStorage<ObservabilityContext>();

export function getObservabilityContext(): ObservabilityContext | undefined {
  return observabilityStorage.getStore();
}

export function runWithObservabilityContext<T>(
  context: ObservabilityContext,
  callback: () => T,
): T {
  return observabilityStorage.run(context, callback);
}
