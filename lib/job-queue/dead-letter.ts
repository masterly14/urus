import type { JobType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { JobRecord } from "./types";

export interface DeadLetterJob {
  id: string;
  type: JobType;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  failedAt: Date | null;
  createdAt: Date;
  sourceEventId: string | null;
}

export interface DeadLetterListOptions {
  type?: JobType;
  limit?: number;
  offset?: number;
}

export interface DeadLetterStats {
  total: number;
  byType: Record<string, number>;
  oldestAt: Date | null;
  newestAt: Date | null;
}

export async function listDeadLetterJobs(
  options: DeadLetterListOptions = {},
): Promise<DeadLetterJob[]> {
  const { type, limit = 20, offset = 0 } = options;

  const jobs = await prisma.jobQueue.findMany({
    where: {
      status: "DEAD_LETTER",
      ...(type ? { type } : {}),
    },
    orderBy: { failedAt: "desc" },
    take: limit,
    skip: offset,
    select: {
      id: true,
      type: true,
      payload: true,
      attempts: true,
      maxAttempts: true,
      lastError: true,
      failedAt: true,
      createdAt: true,
      sourceEventId: true,
    },
  });

  return jobs;
}

export async function getDeadLetterStats(): Promise<DeadLetterStats> {
  const [groups, oldest, newest] = await Promise.all([
    prisma.jobQueue.groupBy({
      by: ["type"],
      where: { status: "DEAD_LETTER" },
      _count: { id: true },
    }),
    prisma.jobQueue.findFirst({
      where: { status: "DEAD_LETTER" },
      orderBy: { failedAt: "asc" },
      select: { failedAt: true },
    }),
    prisma.jobQueue.findFirst({
      where: { status: "DEAD_LETTER" },
      orderBy: { failedAt: "desc" },
      select: { failedAt: true },
    }),
  ]);

  const byType: Record<string, number> = {};
  let total = 0;
  for (const g of groups) {
    byType[g.type] = g._count.id;
    total += g._count.id;
  }

  return {
    total,
    byType,
    oldestAt: oldest?.failedAt ?? null,
    newestAt: newest?.failedAt ?? null,
  };
}

/**
 * Reencola un job de la DLQ, reseteando intentos y poniéndolo PENDING.
 * Útil para reintentar manualmente tras corregir la causa raíz.
 */
export async function replayDeadLetterJob(
  jobId: string,
  options?: { maxAttempts?: number },
): Promise<JobRecord> {
  const job = await prisma.jobQueue.findUnique({ where: { id: jobId } });

  if (!job) throw new Error(`Job no existe: ${jobId}`);
  if (job.status !== "DEAD_LETTER") {
    throw new Error(
      `Job ${jobId} no está en DEAD_LETTER (actual: ${job.status})`,
    );
  }

  const updated = await prisma.jobQueue.update({
    where: { id: jobId },
    data: {
      status: "PENDING",
      attempts: 0,
      maxAttempts: options?.maxAttempts ?? job.maxAttempts,
      availableAt: new Date(),
      failedAt: null,
      lastError: null,
      lockedAt: null,
      lockedBy: null,
    },
  });

  console.log(
    `[dead-letter] Job ${jobId} (${job.type}) reencolado como PENDING`,
  );

  return updated;
}

const REPLAY_BATCH_LIMIT = 100;

/**
 * Reencola jobs de la DLQ de un tipo específico, en batches de {@link REPLAY_BATCH_LIMIT}.
 * Devuelve la cantidad de jobs reencolados en esta invocación.
 */
export async function replayAllDeadLetterByType(
  type: JobType,
  options?: { maxAttempts?: number; batchSize?: number },
): Promise<number> {
  const limit = options?.batchSize ?? REPLAY_BATCH_LIMIT;

  const ids = await prisma.jobQueue.findMany({
    where: { status: "DEAD_LETTER", type },
    select: { id: true },
    take: limit,
    orderBy: { failedAt: "asc" },
  });

  if (ids.length === 0) return 0;

  const result = await prisma.jobQueue.updateMany({
    where: { id: { in: ids.map((j) => j.id) } },
    data: {
      status: "PENDING",
      attempts: 0,
      ...(options?.maxAttempts ? { maxAttempts: options.maxAttempts } : {}),
      availableAt: new Date(),
      failedAt: null,
      lastError: null,
      lockedAt: null,
      lockedBy: null,
    },
  });

  console.log(
    `[dead-letter] ${result.count} job(s) ${type} reencolados como PENDING (batch limit: ${limit})`,
  );

  return result.count;
}

/**
 * Elimina jobs de la DLQ que llevan más de `olderThanMs` milisegundos.
 */
export async function purgeDeadLetterJobs(
  olderThanMs: number,
  type?: JobType,
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);

  const result = await prisma.jobQueue.deleteMany({
    where: {
      status: "DEAD_LETTER",
      failedAt: { lt: cutoff },
      ...(type ? { type } : {}),
    },
  });

  console.log(
    `[dead-letter] ${result.count} job(s) purgados (anteriores a ${cutoff.toISOString()})`,
  );

  return result.count;
}
