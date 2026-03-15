import type { Event, EnqueueJobInput, EventType, JobType } from "@/types/domain";

export interface HandlerResult {
  success: boolean;
  followUpJobs?: EnqueueJobInput[];
  error?: string;
}

export type EventHandler = (event: Event) => Promise<HandlerResult>;

export interface ConsumerConfig {
  workerId: string;
  batchSize?: number;
  pollIntervalMs?: number;
  maxCycles?: number;
  types?: JobType[];
}

export interface ConsumerCycleResult {
  processed: number;
  failed: number;
  noWork: boolean;
}

export interface ConsumerLoopResult {
  totalProcessed: number;
  totalFailed: number;
  cycles: number;
}

export interface HandlerRegistryEntry {
  type: EventType;
  handler: EventHandler;
}
