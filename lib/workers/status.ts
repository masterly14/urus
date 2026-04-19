import { JobStatus, JobType } from "@/app/generated/prisma/client";
import type { CircuitBreakerStatus } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// Tiempo máximo (en minutos) sin poll exitoso antes de marcar un worker como "degraded".
const DEGRADED_THRESHOLD_MIN = 30;

const RECENT_ERRORS_LIMIT = 5;

export type WorkerStatus = "ok" | "degraded" | "never_run";

export interface WorkerInfo {
  id: string;
  label: string;
  lastSuccessAt: string | null;
  status: WorkerStatus;
  lastSuccessSource: "ingestion_cycle_metrics" | "snapshot" | "job_queue" | "execution_metrics";
  ageMinutes: number | null;
}

export interface JobQueueCounts {
  pending: number;
  inProgress: number;
  completed: number;
  failed: number;
  deadLetter: number;
}

export interface RecentError {
  id: string;
  type: JobType;
  lastError: string | null;
  failedAt: string | null;
}

export interface PendingJobInfo {
  id: string;
  type: JobType;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  availableAt: string | null;
  createdAt: string;
  sourceEventId: string | null;
  lastError: string | null;
  ageMinutes: number;
}

export interface PendingJobsByType {
  type: JobType;
  count: number;
}

export interface CircuitBreakerInfo {
  id: string;
  status: CircuitBreakerStatus;
  failureCount: number;
  lastFailedAt: string | null;
  openedAt: string | null;
  updatedAt: string;
}

export interface WorkersStatusFull {
  status: "ok" | "degraded" | "error";
  db: "ok" | "error";
  timestamp: string;
  workers: WorkerInfo[];
  jobQueue: JobQueueCounts;
  pendingJobs: PendingJobInfo[];
  pendingByType: PendingJobsByType[];
  recentErrors: RecentError[];
  circuitBreakers: CircuitBreakerInfo[];
}

export interface WorkersStatusMinimal {
  status: "ok" | "degraded" | "error";
  db: "ok" | "error";
  timestamp: string;
}

function computeWorkerStatus(lastSuccessAt: Date | null): WorkerStatus {
  if (!lastSuccessAt) return "never_run";
  const ageMin = (Date.now() - lastSuccessAt.getTime()) / 60_000;
  return ageMin > DEGRADED_THRESHOLD_MIN ? "degraded" : "ok";
}

function computeAgeMinutes(date: Date | null): number | null {
  if (!date) return null;
  return Math.round(((Date.now() - date.getTime()) / 60_000) * 10) / 10;
}

function toIsoOrNull(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

async function checkDb(): Promise<boolean> {
  try {
    await prisma.$queryRaw<[{ val: number }]>`SELECT 1 AS val`;
    return true;
  } catch {
    return false;
  }
}

async function getLastPropertySnapshotUpdate(): Promise<Date | null> {
  const result = await prisma.propertySnapshot.aggregate({
    _max: { updatedAt: true },
  });
  return result._max.updatedAt ?? null;
}

async function getLastIngestionMetricSuccess(worker: "properties" | "demands"): Promise<Date | null> {
  const row = await prisma.ingestionCycleMetric.findFirst({
    where: { worker, success: true },
    orderBy: { finishedAt: "desc" },
    select: { finishedAt: true },
  });
  return row?.finishedAt ?? null;
}

async function getLastDemandSnapshotUpdate(): Promise<Date | null> {
  const result = await prisma.demandSnapshot.aggregate({
    _max: { updatedAt: true },
  });
  return result._max.updatedAt ?? null;
}

async function getLastEgestionSuccess(): Promise<Date | null> {
  const job = await prisma.jobQueue.findFirst({
    where: { type: JobType.WRITE_TO_INMOVILLA, status: JobStatus.COMPLETED },
    orderBy: { completedAt: "desc" },
    select: { completedAt: true },
  });
  return job?.completedAt ?? null;
}

async function getLastConsumerSuccess(): Promise<Date | null> {
  const rows = await prisma.$queryRaw<Array<{ finishedAt: Date | null }>>`
    SELECT "finishedAt"
    FROM "execution_metrics"
    WHERE "workerName" = 'consumer'
      AND "operation" = 'consumer:loop'
      AND "success" = true
    ORDER BY "finishedAt" DESC
    LIMIT 1
  `;
  return rows[0]?.finishedAt ?? null;
}

async function getJobQueueCounts(): Promise<JobQueueCounts> {
  const groups = await prisma.jobQueue.groupBy({
    by: ["status"],
    _count: { id: true },
  });

  const map = new Map<JobStatus, number>();
  for (const g of groups) {
    map.set(g.status, g._count.id);
  }

  return {
    pending: map.get(JobStatus.PENDING) ?? 0,
    inProgress: map.get(JobStatus.IN_PROGRESS) ?? 0,
    completed: map.get(JobStatus.COMPLETED) ?? 0,
    failed: map.get(JobStatus.FAILED) ?? 0,
    deadLetter: map.get(JobStatus.DEAD_LETTER) ?? 0,
  };
}

async function getPendingJobs(limit = 10): Promise<PendingJobInfo[]> {
  const jobs = await prisma.jobQueue.findMany({
    where: { status: { in: [JobStatus.PENDING, JobStatus.IN_PROGRESS] } },
    orderBy: [
      { status: "asc" },
      { availableAt: "asc" },
      { createdAt: "asc" },
    ],
    take: limit,
    select: {
      id: true,
      type: true,
      status: true,
      attempts: true,
      maxAttempts: true,
      availableAt: true,
      createdAt: true,
      sourceEventId: true,
      lastError: true,
    },
  });

  return jobs.map((job) => ({
    id: job.id,
    type: job.type,
    status: job.status,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    availableAt: toIsoOrNull(job.availableAt),
    createdAt: job.createdAt.toISOString(),
    sourceEventId: job.sourceEventId,
    lastError: job.lastError,
    ageMinutes:
      Math.round(((Date.now() - job.createdAt.getTime()) / 60_000) * 10) / 10,
  }));
}

async function getPendingJobsByType(): Promise<PendingJobsByType[]> {
  const groups = await prisma.jobQueue.groupBy({
    by: ["type"],
    where: { status: JobStatus.PENDING },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
  });

  return groups.map((group) => ({
    type: group.type,
    count: group._count.id,
  }));
}

async function getCircuitBreakers(): Promise<CircuitBreakerInfo[]> {
  const rows = await prisma.circuitBreaker.findMany({
    orderBy: { updatedAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    failureCount: r.failureCount,
    lastFailedAt: toIsoOrNull(r.lastFailedAt),
    openedAt: toIsoOrNull(r.openedAt),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

async function getRecentErrors(): Promise<RecentError[]> {
  const jobs = await prisma.jobQueue.findMany({
    where: { status: { in: [JobStatus.FAILED, JobStatus.DEAD_LETTER] } },
    orderBy: { failedAt: "desc" },
    take: RECENT_ERRORS_LIMIT,
    select: { id: true, type: true, lastError: true, failedAt: true },
  });

  return jobs.map((j) => ({
    id: j.id,
    type: j.type,
    lastError: j.lastError,
    failedAt: toIsoOrNull(j.failedAt),
  }));
}

export async function getWorkersStatusMinimal(): Promise<WorkersStatusMinimal> {
  const timestamp = new Date().toISOString();
  const dbOk = await checkDb();

  return {
    status: dbOk ? "ok" : "error",
    db: dbOk ? "ok" : "error",
    timestamp,
  };
}

export async function getWorkersStatusFull(): Promise<WorkersStatusFull> {
  const timestamp = new Date().toISOString();
  const dbOk = await checkDb();

  if (!dbOk) {
    return {
      status: "error",
      db: "error",
      timestamp,
      workers: [],
      jobQueue: { pending: 0, inProgress: 0, completed: 0, failed: 0, deadLetter: 0 },
      pendingJobs: [],
      pendingByType: [],
      recentErrors: [],
      circuitBreakers: [],
    };
  }

  const [
    lastPropMetricSuccess,
    lastPropSnapshotUpdate,
    lastDemandMetricSuccess,
    lastDemandSnapshotUpdate,
    lastEgestion,
    lastConsumer,
    jobQueue,
    pendingJobs,
    pendingByType,
    recentErrors,
    circuitBreakers,
  ] =
    await Promise.all([
      getLastIngestionMetricSuccess("properties"),
      getLastPropertySnapshotUpdate(),
      getLastIngestionMetricSuccess("demands"),
      getLastDemandSnapshotUpdate(),
      getLastEgestionSuccess(),
      getLastConsumerSuccess(),
      getJobQueueCounts(),
      getPendingJobs(),
      getPendingJobsByType(),
      getRecentErrors(),
      getCircuitBreakers(),
    ]);

  const lastPropSuccess = lastPropMetricSuccess ?? lastPropSnapshotUpdate;
  const lastDemandSuccess = lastDemandMetricSuccess ?? lastDemandSnapshotUpdate;

  const workers: WorkerInfo[] = [
    {
      id: "ingestion:properties",
      label: "Ingesta propiedades",
      lastSuccessAt: toIsoOrNull(lastPropSuccess),
      status: computeWorkerStatus(lastPropSuccess),
      lastSuccessSource: lastPropMetricSuccess ? "ingestion_cycle_metrics" : "snapshot",
      ageMinutes: computeAgeMinutes(lastPropSuccess),
    },
    {
      id: "ingestion:demands",
      label: "Ingesta demandas",
      lastSuccessAt: toIsoOrNull(lastDemandSuccess),
      status: computeWorkerStatus(lastDemandSuccess),
      lastSuccessSource: lastDemandMetricSuccess ? "ingestion_cycle_metrics" : "snapshot",
      ageMinutes: computeAgeMinutes(lastDemandSuccess),
    },
    {
      id: "egestion",
      label: "Egestión",
      lastSuccessAt: toIsoOrNull(lastEgestion),
      status: computeWorkerStatus(lastEgestion),
      lastSuccessSource: "job_queue",
      ageMinutes: computeAgeMinutes(lastEgestion),
    },
    {
      id: "consumer",
      label: "Consumer",
      lastSuccessAt: toIsoOrNull(lastConsumer),
      status: computeWorkerStatus(lastConsumer),
      lastSuccessSource: "execution_metrics",
      ageMinutes: computeAgeMinutes(lastConsumer),
    },
  ];

  const hasDegraded = workers.some((w) => w.status !== "ok");
  const globalStatus = hasDegraded ? "degraded" : "ok";

  return {
    status: globalStatus,
    db: "ok",
    timestamp,
    workers,
    jobQueue,
    pendingJobs,
    pendingByType,
    recentErrors,
    circuitBreakers,
  };
}
