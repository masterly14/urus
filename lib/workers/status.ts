import { JobStatus, JobType } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// Tiempo máximo (en minutos) sin poll exitoso antes de marcar un worker como "degraded".
const DEGRADED_THRESHOLD_MIN = 30;

const RECENT_ERRORS_LIMIT = 5;

export type WorkerStatus = "ok" | "degraded" | "never_run";

export interface WorkerInfo {
  id: string;
  lastSuccessAt: string | null;
  status: WorkerStatus;
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

export interface WorkersStatusFull {
  status: "ok" | "degraded" | "error";
  db: "ok" | "error";
  timestamp: string;
  workers: WorkerInfo[];
  jobQueue: JobQueueCounts;
  recentErrors: RecentError[];
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
      recentErrors: [],
    };
  }

  const [lastPropUpdate, lastDemandUpdate, lastEgestion, jobQueue, recentErrors] =
    await Promise.all([
      getLastPropertySnapshotUpdate(),
      getLastDemandSnapshotUpdate(),
      getLastEgestionSuccess(),
      getJobQueueCounts(),
      getRecentErrors(),
    ]);

  const workers: WorkerInfo[] = [
    {
      id: "ingestion:properties",
      lastSuccessAt: toIsoOrNull(lastPropUpdate),
      status: computeWorkerStatus(lastPropUpdate),
    },
    {
      id: "ingestion:demands",
      lastSuccessAt: toIsoOrNull(lastDemandUpdate),
      status: computeWorkerStatus(lastDemandUpdate),
    },
    {
      id: "egestion",
      lastSuccessAt: toIsoOrNull(lastEgestion),
      status: computeWorkerStatus(lastEgestion),
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
    recentErrors,
  };
}
