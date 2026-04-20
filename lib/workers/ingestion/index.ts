export { runPropertiesIngestionCycle } from "./properties-worker";
export { runExtrainfoIngestionCycle } from "./extrainfo-worker";
export type { ExtrainfoCycleResult } from "./extrainfo-worker";
export { runTasksIngestionCycle } from "./tasks";
export { publishEventsForDiff } from "./event-publisher";
export { computePropertyDiff } from "./properties-diff";
export { loadPreviousSnapshot, saveCurrentSnapshot } from "./snapshot-repo";
export {
  runDemandsIngestionCycle,
  publishDemandEventsForDiff,
  computeDemandDiff,
  loadPreviousDemandSnapshot,
  saveCurrentDemandSnapshot,
  DEMAND_DIFF_FIELDS,
} from "./demands";
export { DIFF_FIELDS } from "./types";
export type {
  PropertyDiffResult,
  PropertyChange,
  IngestionCycleResult,
  DiffField,
} from "./types";
export type {
  DemandDiffField,
  DemandDiffResult,
  DemandCreatedChange,
  DemandModifiedChange,
  DemandStatusChangedChange,
  DemandIngestionCycleResult,
} from "./demands";

// Infraestructura de observabilidad
export { propertiesLogger, demandsLogger } from "./logger";
export type { WorkerLogger, LogLevel, LogEntry } from "./logger";
export { classifyError, isRateLimitError, isRetryableError, IngestionError } from "./errors";
export type { IngestionErrorCode } from "./errors";
export { saveCycleMetrics, getRecentMetrics, PhaseTimer } from "./metrics";
export type { CycleMetricsData, PhaseTimings, WorkerName, WorkerMode } from "./metrics";
