import type { JobStatus, JobType, Prisma } from "@prisma/client";

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
  /** Si true, el job va directo a DEAD_LETTER sin importar intentos restantes. */
  permanent?: boolean;
}

/**
 * Devuelve un job IN_PROGRESS al estado PENDING sin penalizar `attempts`.
 *
 * Caso de uso: el worker rechazó el trabajo de forma transitoria por una
 * condición que no es un fallo del job en sí (p. ej. `CONCURRENCY_LIMIT`
 * porque todos los slots del worker están ocupados). En ese escenario el
 * extractor nunca arrancó, así que contar el intento como fallido (vía
 * `markFailed`) llevaría el job a `DEAD_LETTER` tras pocos rebotes y
 * perdería trabajo legítimo.
 *
 * Decrementa el contador `attempts` (que `dequeueJob` incrementó al
 * tomarlo) para que el siguiente reintento no consuma cuota.
 */
export interface RequeueJobInput {
  jobId: string;
  /** Motivo registrado en `lastError` para auditar por qué se reencoló. */
  reason: string;
  workerId?: string;
  now?: Date;
  /** Cuánto esperar antes de que el job vuelva a estar disponible. Default 5s. */
  retryDelayMs?: number;
}

