import type { JobType } from "@/app/generated/prisma/client";

export interface ProjectionWorkerConfig {
  workerId: string;
  batchSize?: number;
  pollIntervalMs?: number;
  maxCycles?: number;
}

export interface ProjectionCycleResult {
  processed: number;
  failed: number;
  noWork: boolean;
}

export interface ProjectionLoopResult {
  totalProcessed: number;
  totalFailed: number;
  cycles: number;
}

export interface ProjectionApplyResult {
  success: boolean;
  aggregateId: string;
  error?: string;
}

export const PROJECTION_JOB_TYPES: JobType[] = [
  "UPDATE_PROPERTY_PROJECTION",
  "UPDATE_DEMAND_PROJECTION",
];
