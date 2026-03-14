import type { EventType, JobType } from "@/app/generated/prisma/client";
import type { EventRecord } from "@/lib/event-store/types";
import type { EnqueueJobInput } from "@/lib/job-queue/types";

export interface HandlerResult {
  success: boolean;
  followUpJobs?: EnqueueJobInput[];
  error?: string;
}

export type EventHandler = (event: EventRecord) => Promise<HandlerResult>;

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
