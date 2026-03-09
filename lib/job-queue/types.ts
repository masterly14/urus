import type { JobStatus, JobType, Prisma } from "@/app/generated/prisma/client";

export type JsonValue = Prisma.JsonValue;

export interface JobRecord {
  id: string;
  type: JobType;
  status: JobStatus;
  payload: JsonValue;
  priority: number;
  attempts: number;
  maxAttempts: number;
  availableAt: Date;
  lockedAt: Date | null;
  lockedBy: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  lastError: string | null;
  idempotencyKey: string | null;
  sourceEventId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EnqueueJobInput {
  type: JobType;
  payload: JsonValue;
  priority?: number;
  availableAt?: Date;
  maxAttempts?: number;
  idempotencyKey?: string;
  sourceEventId?: string;
}

export interface DequeueJobOptions {
  workerId: string;
  types?: JobType[];
  now?: Date;
  staleLockMs?: number;
}

export interface DequeueJobResult {
  job: JobRecord | null;
}

export interface MarkCompletedInput {
  jobId: string;
  workerId?: string;
  now?: Date;
}

export interface MarkFailedInput {
  jobId: string;
  error: string;
  workerId?: string;
  now?: Date;
  retryDelayMs?: number;
}

