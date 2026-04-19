import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { dequeueJob, enqueueJob, markCompleted, markFailed } from "../job-queue";

const TEST_RUN_ID = `job-queue-test-run-${Date.now()}`;
const WORKER_A = `worker-a-${TEST_RUN_ID}`;
const WORKER_B = `worker-b-${TEST_RUN_ID}`;

function buildKey(suffix: string): string {
  return `${TEST_RUN_ID}-${suffix}-${Math.random().toString(36).slice(2, 8)}`;
}

beforeEach(async () => {
  await prisma.jobQueue.deleteMany({
    where: {
      idempotencyKey: { contains: TEST_RUN_ID },
    },
  });
});

afterAll(async () => {
  await prisma.jobQueue.deleteMany({
    where: {
      idempotencyKey: { contains: TEST_RUN_ID },
    },
  });
  await prisma.$disconnect();
});

const TEST_JOB_TYPE = "WRITE_TO_INMOVILLA" as const;

describe("enqueueJob", () => {
  it("debe crear un job PENDING con payload", async () => {
    const job = await enqueueJob({
      type: TEST_JOB_TYPE,
      payload: { testRun: TEST_RUN_ID, n: 1 },
      idempotencyKey: buildKey("create"),
      priority: 10,
    });

    expect(job.id).toBeDefined();
    expect(job.status).toBe("PENDING");
    expect(job.type).toBe(TEST_JOB_TYPE);
    expect(job.payload).toEqual({ testRun: TEST_RUN_ID, n: 1 });
    expect(job.priority).toBe(10);
  });

  it("debe ser idempotente por idempotencyKey", async () => {
    const key = buildKey("idempotent");

    const first = await enqueueJob({
      type: TEST_JOB_TYPE,
      payload: { testRun: TEST_RUN_ID, x: 1 },
      idempotencyKey: key,
    });
    const second = await enqueueJob({
      type: TEST_JOB_TYPE,
      payload: { testRun: TEST_RUN_ID, x: 999 },
      idempotencyKey: key,
    });

    expect(second.id).toBe(first.id);
  });
});

describe("dequeue + markFailed + retry + markCompleted", () => {
  const dequeueOpts = (now: Date) => ({
    workerId: WORKER_A,
    types: [TEST_JOB_TYPE] as const,
    now,
  });

  it("debe procesar y reintentar: falla -> reintenta -> completa", async () => {
    const key = buildKey("cycle");
    const now = new Date();

    const created = await enqueueJob({
      type: TEST_JOB_TYPE,
      payload: { testRun: TEST_RUN_ID, step: "cycle" },
      idempotencyKey: key,
      priority: 1,
      availableAt: now,
      maxAttempts: 3,
    });

    const firstDeq = await dequeueJob(dequeueOpts(now));

    expect(firstDeq.job?.id).toBe(created.id);
    expect(firstDeq.job?.status).toBe("IN_PROGRESS");
    expect(firstDeq.job?.attempts).toBe(1);
    expect(firstDeq.job?.lockedBy).toBe(WORKER_A);

    const failed = await markFailed({
      jobId: created.id,
      workerId: WORKER_A,
      error: "boom",
      now,
      retryDelayMs: 0,
    });

    expect(failed.status).toBe("PENDING");
    expect(failed.lastError).toBe("boom");
    expect(failed.lockedBy).toBeNull();

    const secondDeq = await dequeueJob(dequeueOpts(now));

    expect(secondDeq.job?.id).toBe(created.id);
    expect(secondDeq.job?.status).toBe("IN_PROGRESS");
    expect(secondDeq.job?.attempts).toBe(2);

    const completed = await markCompleted({
      jobId: created.id,
      workerId: WORKER_A,
      now,
    });

    expect(completed.status).toBe("COMPLETED");
    expect(completed.completedAt).toBeInstanceOf(Date);
    expect(completed.lockedBy).toBeNull();
  });

  it("debe mover a DEAD_LETTER al agotar maxAttempts", async () => {
    const now = new Date();
    const key = buildKey("dlq");

    const job = await enqueueJob({
      type: TEST_JOB_TYPE,
      payload: { testRun: TEST_RUN_ID, step: "dlq" },
      idempotencyKey: key,
      availableAt: now,
      maxAttempts: 1,
    });

    const deq = await dequeueJob(dequeueOpts(now));
    expect(deq.job?.id).toBe(job.id);
    expect(deq.job?.attempts).toBe(1);

    const dead = await markFailed({
      jobId: job.id,
      workerId: WORKER_A,
      error: "permanent",
      now,
      retryDelayMs: 0,
    });

    expect(dead.status).toBe("DEAD_LETTER");
    expect(dead.failedAt).toBeInstanceOf(Date);
    expect(dead.lockedBy).toBeNull();
  });

  it("no debe permitir completar/fallar un job lockeado por otro worker", async () => {
    const now = new Date();
    const key = buildKey("ownership");

    const job = await enqueueJob({
      type: TEST_JOB_TYPE,
      payload: { testRun: TEST_RUN_ID, step: "ownership" },
      idempotencyKey: key,
      availableAt: now,
      maxAttempts: 2,
    });

    const deq = await dequeueJob(dequeueOpts(now));
    expect(deq.job?.id).toBe(job.id);

    await expect(
      markCompleted({ jobId: job.id, workerId: WORKER_B, now }),
    ).rejects.toThrow();

    await expect(
      markFailed({ jobId: job.id, workerId: WORKER_B, error: "x", now }),
    ).rejects.toThrow();
  });
});

