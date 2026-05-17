import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { alertDeadLetter } from "@/lib/alerts";
import type {
  DequeueJobOptions,
  DequeueJobResult,
  EnqueueJobInput,
  JobRecord,
  MarkCompletedInput,
  MarkFailedInput,
  RequeueJobInput,
} from "./types";

function defaultNow(now?: Date): Date {
  return now ?? new Date();
}

function computeBackoffMs(attempts: number): number {
  // attempts empieza en 1 cuando el worker adquiere el lock (dequeue).
  // Backoff exponencial corto: 1s, 2s, 4s, 8s... (capped a 60s).
  const base = 1000;
  const ms = base * Math.pow(2, Math.max(0, attempts - 1));
  return Math.min(ms, 60_000);
}

export async function enqueueJob(input: EnqueueJobInput): Promise<JobRecord> {
  const data: Prisma.JobQueueCreateInput = {
    type: input.type,
    payload: (input.payload ?? {}) as Prisma.InputJsonValue,
    ...(input.priority !== undefined ? { priority: input.priority } : {}),
    ...(input.availableAt !== undefined ? { availableAt: input.availableAt } : {}),
    ...(input.maxAttempts !== undefined
      ? { maxAttempts: input.maxAttempts }
      : {}),
    ...(input.idempotencyKey !== undefined
      ? { idempotencyKey: input.idempotencyKey }
      : {}),
    ...(input.sourceEventId !== undefined
      ? { sourceEvent: { connect: { id: input.sourceEventId } } }
      : {}),
  };

  try {
    const job = await prisma.jobQueue.create({ data });
    return job;
  } catch (err: unknown) {
    // Idempotencia: si choca la clave única, devolvemos el job existente.
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "P2002" &&
      input.idempotencyKey
    ) {
      const existing = await prisma.jobQueue.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) return existing;
    }
    throw err;
  }
}

export async function dequeueJob(
  options: DequeueJobOptions,
): Promise<DequeueJobResult> {
  const now = defaultNow(options.now);
  const staleLockMs = options.staleLockMs ?? 10 * 60 * 1000;
  const staleBefore = new Date(now.getTime() - staleLockMs);

  const types = options.types?.length ? options.types : null;
  const workerId = options.workerId;

  const rows = await prisma.$transaction(async (tx) => {
    // Reclamación atómica:
    // - El subselect elige 1 job elegible, bloquea esa fila y evita duplicados con SKIP LOCKED.
    // - El UPDATE hace la transición a IN_PROGRESS, asigna lock y aumenta attempts.
    // - Incluimos recuperación de locks stale: IN_PROGRESS con lockedAt viejo.
    const claimed = await tx.$queryRaw<JobRecord[]>`
      UPDATE "job_queue"
      SET
        "status" = 'IN_PROGRESS',
        "lockedAt" = ${now},
        "lockedBy" = ${workerId},
        "startedAt" = ${now},
        "attempts" = "attempts" + 1,
        "updatedAt" = ${now}
      WHERE "id" = (
        SELECT "id"
        FROM "job_queue"
        WHERE
          (
            ("status" = 'PENDING' AND "availableAt" <= ${now})
            OR ("status" = 'IN_PROGRESS' AND "lockedAt" IS NOT NULL AND "lockedAt" <= ${staleBefore})
          )
          AND (${types}::"JobType"[] IS NULL OR "type" = ANY(${types}::"JobType"[]))
        ORDER BY "priority" ASC, "availableAt" ASC, "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING
        "id",
        "type",
        "status",
        "payload",
        "priority",
        "attempts",
        "maxAttempts",
        "availableAt",
        "lockedAt",
        "lockedBy",
        "startedAt",
        "completedAt",
        "failedAt",
        "lastError",
        "idempotencyKey",
        "sourceEventId",
        "createdAt",
        "updatedAt"
    `;

    return claimed;
  });

  return { job: rows[0] ?? null };
}

export async function markCompleted(
  input: MarkCompletedInput,
): Promise<JobRecord> {
  const now = defaultNow(input.now);

  if (input.workerId) {
    const result = await prisma.$executeRaw`
      UPDATE "job_queue"
      SET "status" = 'COMPLETED',
          "completedAt" = ${now},
          "lockedAt" = NULL,
          "lockedBy" = NULL,
          "lastError" = NULL,
          "updatedAt" = ${now}
      WHERE "id" = ${input.jobId}
        AND "status" = 'IN_PROGRESS'
        AND "lockedBy" = ${input.workerId}
    `;
    if (result === 0) {
      console.warn(
        `[job-queue] markCompleted: 0 rows updated for job=${input.jobId} worker=${input.workerId} — ownership mismatch or state changed`,
      );
      throw new Error(
        `Job lock no pertenece al worker o estado cambió: ${input.jobId}`,
      );
    }
  } else {
    await prisma.$executeRaw`
      UPDATE "job_queue"
      SET "status" = 'COMPLETED',
          "completedAt" = ${now},
          "lockedAt" = NULL,
          "lockedBy" = NULL,
          "lastError" = NULL,
          "updatedAt" = ${now}
      WHERE "id" = ${input.jobId}
        AND "status" = 'IN_PROGRESS'
    `;
  }

  const updated = await prisma.jobQueue.findUnique({
    where: { id: input.jobId },
  });
  if (!updated) throw new Error(`Job no existe: ${input.jobId}`);
  return updated;
}

/**
 * Devuelve un job IN_PROGRESS a PENDING sin penalizar `attempts`.
 *
 * Diseñado para situaciones en las que el worker indicó que no pudo
 * ejecutar el trabajo por una condición transitoria fuera del control
 * del job (p. ej. `CONCURRENCY_LIMIT`). Decrementa el contador de
 * intentos para revertir el incremento que `dequeueJob` aplicó al
 * tomar el lock.
 *
 * - Verifica ownership del lock cuando se proporciona `workerId`.
 * - Aplica un retry-delay corto (default 5s) para evitar que el mismo
 *   tick lo vuelva a tomar inmediatamente y se rebote en bucle.
 * - Registra `reason` en `lastError` para auditoría.
 */
export async function requeueJob(input: RequeueJobInput): Promise<JobRecord> {
  const now = defaultNow(input.now);
  const retryDelayMs = Math.max(0, input.retryDelayMs ?? 5_000);
  const availableAt = new Date(now.getTime() + retryDelayMs);

  const where: Prisma.JobQueueWhereUniqueInput = { id: input.jobId };
  const job = await prisma.jobQueue.findUnique({ where });
  if (!job) throw new Error(`Job no existe: ${input.jobId}`);
  if (job.status !== "IN_PROGRESS") {
    throw new Error(`Job no está IN_PROGRESS: ${input.jobId}`);
  }
  if (input.workerId && job.lockedBy !== input.workerId) {
    console.warn(
      `[job-queue] requeueJob: ownership mismatch for job=${input.jobId} worker=${input.workerId} lockedBy=${job.lockedBy}`,
    );
    throw new Error(`Job lock no pertenece al worker: ${input.jobId}`);
  }

  console.warn(
    `[job-queue] Job ${job.id} (${job.type}) reencolado sin penalizar attempts (motivo=${input.reason}). Próximo intento en ${retryDelayMs}ms (${availableAt.toISOString()}).`,
  );

  const updated = await prisma.jobQueue.update({
    where,
    data: {
      status: "PENDING",
      availableAt,
      lastError: input.reason,
      lockedAt: null,
      lockedBy: null,
      // Compensa el incremento de `attempts` aplicado en dequeueJob:
      // este reintento no consumió un intento real (el worker nunca ejecutó).
      attempts: Math.max(0, job.attempts - 1),
    },
  });

  return updated;
}

export async function markFailed(input: MarkFailedInput): Promise<JobRecord> {
  const now = defaultNow(input.now);

  const where: Prisma.JobQueueWhereUniqueInput = { id: input.jobId };
  const job = await prisma.jobQueue.findUnique({ where });
  if (!job) throw new Error(`Job no existe: ${input.jobId}`);
  if (job.status !== "IN_PROGRESS") {
    throw new Error(`Job no está IN_PROGRESS: ${input.jobId}`);
  }
  if (input.workerId && job.lockedBy !== input.workerId) {
    console.warn(
      `[job-queue] markFailed: ownership mismatch for job=${input.jobId} worker=${input.workerId} lockedBy=${job.lockedBy}`,
    );
    throw new Error(`Job lock no pertenece al worker: ${input.jobId}`);
  }

  const shouldDeadLetter = input.permanent || job.attempts >= job.maxAttempts;

  if (shouldDeadLetter) {
    const reason = input.permanent
      ? "fallo permanente (no retriable)"
      : `máximo de intentos alcanzado (${job.attempts}/${job.maxAttempts})`;

    console.error(
      `[job-queue] Job ${job.id} (${job.type}) → DEAD_LETTER: ${reason}. Error: ${input.error}`,
    );

    const updated = await prisma.jobQueue.update({
      where,
      data: {
        status: "DEAD_LETTER",
        failedAt: now,
        lastError: input.error,
        lockedAt: null,
        lockedBy: null,
      },
    });

    const payload = (job.payload ?? {}) as Record<string, unknown>;
    alertDeadLetter({
      jobId: job.id,
      jobType: job.type,
      attempts: job.attempts,
      lastError: input.error,
      operation: typeof payload.operation === "string" ? payload.operation : undefined,
      details: { reason },
    }).catch((err) => {
      console.error(
        `[job-queue] Error emitiendo alerta DLQ: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    return updated;
  }

  const retryDelayMs =
    input.retryDelayMs ?? computeBackoffMs(Math.max(1, job.attempts));
  const availableAt = new Date(now.getTime() + Math.max(0, retryDelayMs));

  console.warn(
    `[job-queue] Job ${job.id} (${job.type}) — reintento ${job.attempts}/${job.maxAttempts}, próximo en ${retryDelayMs}ms (${availableAt.toISOString()}). Error: ${input.error}`,
  );

  const updated = await prisma.jobQueue.update({
    where,
    data: {
      status: "PENDING",
      availableAt,
      failedAt: now,
      lastError: input.error,
      lockedAt: null,
      lockedBy: null,
    },
  });

  return updated;
}

