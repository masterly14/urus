import { describe, it, expect, beforeEach, vi } from "vitest";
import type { JobRecord } from "../types";

const {
  mockJobCreate,
  mockJobFindUnique,
  mockJobUpdate,
  mockTransaction,
  mockQueryRaw,
} = vi.hoisted(() => ({
  mockJobCreate: vi.fn(),
  mockJobFindUnique: vi.fn(),
  mockJobUpdate: vi.fn(),
  mockTransaction: vi.fn(),
  mockQueryRaw: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    jobQueue: {
      create: mockJobCreate,
      findUnique: mockJobFindUnique,
      update: mockJobUpdate,
    },
    $transaction: mockTransaction,
  },
}));

import {
  enqueueJob,
  dequeueJob,
  markCompleted,
  markFailed,
} from "../job-queue";

const NOW = new Date("2026-03-15T10:00:00Z");

function fakeJob(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: "job-abc",
    type: "PROCESS_EVENT",
    status: "PENDING",
    payload: {},
    priority: 100,
    attempts: 0,
    maxAttempts: 5,
    availableAt: NOW,
    lockedAt: null,
    lockedBy: null,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    lastError: null,
    idempotencyKey: null,
    sourceEventId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTransaction.mockImplementation(
    async (
      cb: (tx: { $queryRaw: typeof mockQueryRaw }) => Promise<JobRecord[]>,
    ) => cb({ $queryRaw: mockQueryRaw }),
  );
});

// ---------------------------------------------------------------------------
// enqueueJob
// ---------------------------------------------------------------------------
describe("enqueueJob", () => {
  it("debe crear job con campos requeridos", async () => {
    const created = fakeJob();
    mockJobCreate.mockResolvedValueOnce(created);

    const result = await enqueueJob({
      type: "PROCESS_EVENT",
      payload: { step: "test" },
    });

    expect(result).toEqual(created);
    expect(mockJobCreate).toHaveBeenCalledOnce();

    const data = mockJobCreate.mock.calls[0][0].data;
    expect(data.type).toBe("PROCESS_EVENT");
    expect(data.payload).toEqual({ step: "test" });
  });

  it("debe usar objeto vacío como payload por defecto cuando es null", async () => {
    mockJobCreate.mockResolvedValueOnce(fakeJob());

    await enqueueJob({ type: "PROCESS_EVENT", payload: null });

    const data = mockJobCreate.mock.calls[0][0].data;
    expect(data.payload).toEqual({});
  });

  it("debe incluir campos opcionales cuando se proporcionan", async () => {
    const availableAt = new Date("2026-03-16T08:00:00Z");
    mockJobCreate.mockResolvedValueOnce(fakeJob());

    await enqueueJob({
      type: "WRITE_TO_INMOVILLA",
      payload: { op: "create" },
      priority: 1,
      availableAt,
      maxAttempts: 10,
      idempotencyKey: "key-123",
    });

    const data = mockJobCreate.mock.calls[0][0].data;
    expect(data.priority).toBe(1);
    expect(data.availableAt).toEqual(availableAt);
    expect(data.maxAttempts).toBe(10);
    expect(data.idempotencyKey).toBe("key-123");
  });

  it("debe omitir campos opcionales cuando son undefined", async () => {
    mockJobCreate.mockResolvedValueOnce(fakeJob());

    await enqueueJob({ type: "PROCESS_EVENT", payload: {} });

    const data = mockJobCreate.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("priority");
    expect(data).not.toHaveProperty("availableAt");
    expect(data).not.toHaveProperty("maxAttempts");
    expect(data).not.toHaveProperty("idempotencyKey");
    expect(data).not.toHaveProperty("sourceEvent");
  });

  it("debe conectar sourceEvent cuando sourceEventId está presente", async () => {
    mockJobCreate.mockResolvedValueOnce(fakeJob({ sourceEventId: "evt-1" }));

    await enqueueJob({
      type: "PROCESS_EVENT",
      payload: {},
      sourceEventId: "evt-1",
    });

    const data = mockJobCreate.mock.calls[0][0].data;
    expect(data.sourceEvent).toEqual({ connect: { id: "evt-1" } });
  });

  it("debe retornar job existente en colisión de idempotencyKey (P2002)", async () => {
    const existing = fakeJob({ id: "existing-job", idempotencyKey: "dup-key" });
    mockJobCreate.mockRejectedValueOnce(
      Object.assign(new Error("Unique constraint"), { code: "P2002" }),
    );
    mockJobFindUnique.mockResolvedValueOnce(existing);

    const result = await enqueueJob({
      type: "PROCESS_EVENT",
      payload: { x: 999 },
      idempotencyKey: "dup-key",
    });

    expect(result).toEqual(existing);
    expect(mockJobFindUnique).toHaveBeenCalledWith({
      where: { idempotencyKey: "dup-key" },
    });
  });

  it("debe relanzar error P2002 cuando no hay idempotencyKey", async () => {
    const p2002 = Object.assign(new Error("Unique"), { code: "P2002" });
    mockJobCreate.mockRejectedValueOnce(p2002);

    await expect(
      enqueueJob({ type: "PROCESS_EVENT", payload: {} }),
    ).rejects.toThrow("Unique");
    expect(mockJobFindUnique).not.toHaveBeenCalled();
  });

  it("debe relanzar errores que no son P2002", async () => {
    mockJobCreate.mockRejectedValueOnce(new Error("Connection timeout"));

    await expect(
      enqueueJob({
        type: "PROCESS_EVENT",
        payload: {},
        idempotencyKey: "key-x",
      }),
    ).rejects.toThrow("Connection timeout");
    expect(mockJobFindUnique).not.toHaveBeenCalled();
  });

  it("debe relanzar P2002 si findUnique no encuentra el job existente", async () => {
    const p2002 = Object.assign(new Error("Unique"), { code: "P2002" });
    mockJobCreate.mockRejectedValueOnce(p2002);
    mockJobFindUnique.mockResolvedValueOnce(null);

    await expect(
      enqueueJob({
        type: "PROCESS_EVENT",
        payload: {},
        idempotencyKey: "ghost-key",
      }),
    ).rejects.toThrow("Unique");
  });

  it("debe relanzar error si err no es un objeto", async () => {
    mockJobCreate.mockRejectedValueOnce("string error");

    await expect(
      enqueueJob({
        type: "PROCESS_EVENT",
        payload: {},
        idempotencyKey: "k",
      }),
    ).rejects.toBe("string error");
  });
});

// ---------------------------------------------------------------------------
// dequeueJob
// ---------------------------------------------------------------------------
describe("dequeueJob", () => {
  it("debe retornar el job reclamado por la transacción", async () => {
    const claimed = fakeJob({ status: "IN_PROGRESS", attempts: 1 });
    mockQueryRaw.mockResolvedValueOnce([claimed]);

    const result = await dequeueJob({
      workerId: "worker-1",
      types: ["PROCESS_EVENT"],
      now: NOW,
    });

    expect(result.job).toEqual(claimed);
    expect(mockTransaction).toHaveBeenCalledOnce();
  });

  it("debe retornar null cuando no hay jobs disponibles", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);

    const result = await dequeueJob({
      workerId: "worker-1",
      now: NOW,
    });

    expect(result.job).toBeNull();
  });

  it("debe pasar null como types cuando la lista es vacía", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);

    await dequeueJob({
      workerId: "worker-1",
      types: [],
      now: NOW,
    });

    const rawArgs = mockQueryRaw.mock.calls[0];
    const typesArg = rawArgs[7];
    expect(typesArg).toBeNull();
  });

  it("debe pasar null como types cuando no se proporcionan", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);

    await dequeueJob({ workerId: "worker-1", now: NOW });

    const rawArgs = mockQueryRaw.mock.calls[0];
    const typesArg = rawArgs[7];
    expect(typesArg).toBeNull();
  });

  it("debe pasar types cuando se proporcionan", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);

    await dequeueJob({
      workerId: "worker-1",
      types: ["PROCESS_EVENT", "WRITE_TO_INMOVILLA"],
      now: NOW,
    });

    const rawArgs = mockQueryRaw.mock.calls[0];
    const typesArg = rawArgs[7];
    expect(typesArg).toEqual(["PROCESS_EVENT", "WRITE_TO_INMOVILLA"]);
  });

  it("debe calcular staleBefore con staleLockMs por defecto (10 min)", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);

    await dequeueJob({ workerId: "worker-1", now: NOW });

    const rawArgs = mockQueryRaw.mock.calls[0];
    const staleBefore = rawArgs[6] as Date;
    expect(staleBefore.getTime()).toBe(NOW.getTime() - 10 * 60 * 1000);
  });

  it("debe usar staleLockMs personalizado cuando se proporciona", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);

    await dequeueJob({
      workerId: "worker-1",
      now: NOW,
      staleLockMs: 30_000,
    });

    const rawArgs = mockQueryRaw.mock.calls[0];
    const staleBefore = rawArgs[6] as Date;
    expect(staleBefore.getTime()).toBe(NOW.getTime() - 30_000);
  });

  it("debe pasar workerId a la query SQL", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);

    await dequeueJob({ workerId: "special-worker", now: NOW });

    const rawArgs = mockQueryRaw.mock.calls[0];
    const workerIdArg = rawArgs[2];
    expect(workerIdArg).toBe("special-worker");
  });
});

// ---------------------------------------------------------------------------
// markCompleted
// ---------------------------------------------------------------------------
describe("markCompleted", () => {
  it("debe completar un job IN_PROGRESS correctamente", async () => {
    const job = fakeJob({
      status: "IN_PROGRESS",
      lockedBy: "w1",
      attempts: 1,
    });
    const updated = fakeJob({
      status: "COMPLETED",
      completedAt: NOW,
      lockedAt: null,
      lockedBy: null,
    });
    mockJobFindUnique.mockResolvedValueOnce(job);
    mockJobUpdate.mockResolvedValueOnce(updated);

    const result = await markCompleted({
      jobId: "job-abc",
      workerId: "w1",
      now: NOW,
    });

    expect(result.status).toBe("COMPLETED");
    expect(mockJobUpdate).toHaveBeenCalledWith({
      where: { id: "job-abc" },
      data: {
        status: "COMPLETED",
        completedAt: NOW,
        lockedAt: null,
        lockedBy: null,
        lastError: null,
      },
    });
  });

  it("debe lanzar error si el job no existe", async () => {
    mockJobFindUnique.mockResolvedValueOnce(null);

    await expect(
      markCompleted({ jobId: "ghost-job", now: NOW }),
    ).rejects.toThrow("Job no existe: ghost-job");
  });

  it("debe lanzar error si el job no está IN_PROGRESS", async () => {
    mockJobFindUnique.mockResolvedValueOnce(fakeJob({ status: "COMPLETED" }));

    await expect(
      markCompleted({ jobId: "job-abc", now: NOW }),
    ).rejects.toThrow("Job no está IN_PROGRESS: job-abc");
  });

  it("debe lanzar error si workerId no coincide con lockedBy", async () => {
    mockJobFindUnique.mockResolvedValueOnce(
      fakeJob({ status: "IN_PROGRESS", lockedBy: "w1" }),
    );

    await expect(
      markCompleted({ jobId: "job-abc", workerId: "w2", now: NOW }),
    ).rejects.toThrow("Job lock no pertenece al worker: job-abc");
  });

  it("debe permitir completar sin verificación de workerId", async () => {
    const job = fakeJob({
      status: "IN_PROGRESS",
      lockedBy: "w1",
      attempts: 1,
    });
    const updated = fakeJob({ status: "COMPLETED" });
    mockJobFindUnique.mockResolvedValueOnce(job);
    mockJobUpdate.mockResolvedValueOnce(updated);

    const result = await markCompleted({ jobId: "job-abc", now: NOW });

    expect(result.status).toBe("COMPLETED");
  });

  it("debe permitir completar cuando workerId coincide con lockedBy", async () => {
    const job = fakeJob({
      status: "IN_PROGRESS",
      lockedBy: "exact-match",
      attempts: 1,
    });
    const updated = fakeJob({ status: "COMPLETED" });
    mockJobFindUnique.mockResolvedValueOnce(job);
    mockJobUpdate.mockResolvedValueOnce(updated);

    const result = await markCompleted({
      jobId: "job-abc",
      workerId: "exact-match",
      now: NOW,
    });

    expect(result.status).toBe("COMPLETED");
  });
});

// ---------------------------------------------------------------------------
// markFailed
// ---------------------------------------------------------------------------
describe("markFailed", () => {
  it("debe reintentar (PENDING) cuando hay intentos restantes", async () => {
    const job = fakeJob({
      status: "IN_PROGRESS",
      attempts: 1,
      maxAttempts: 3,
      lockedBy: "w1",
    });
    const updated = fakeJob({ status: "PENDING" });
    mockJobFindUnique.mockResolvedValueOnce(job);
    mockJobUpdate.mockResolvedValueOnce(updated);

    const result = await markFailed({
      jobId: "job-abc",
      workerId: "w1",
      error: "timeout",
      now: NOW,
      retryDelayMs: 5000,
    });

    expect(result.status).toBe("PENDING");
    expect(mockJobUpdate).toHaveBeenCalledWith({
      where: { id: "job-abc" },
      data: {
        status: "PENDING",
        availableAt: new Date(NOW.getTime() + 5000),
        failedAt: NOW,
        lastError: "timeout",
        lockedAt: null,
        lockedBy: null,
      },
    });
  });

  it("debe mover a DEAD_LETTER cuando se agotan los intentos", async () => {
    const job = fakeJob({
      status: "IN_PROGRESS",
      attempts: 5,
      maxAttempts: 5,
      lockedBy: "w1",
    });
    const updated = fakeJob({ status: "DEAD_LETTER" });
    mockJobFindUnique.mockResolvedValueOnce(job);
    mockJobUpdate.mockResolvedValueOnce(updated);

    const result = await markFailed({
      jobId: "job-abc",
      workerId: "w1",
      error: "permanent failure",
      now: NOW,
    });

    expect(result.status).toBe("DEAD_LETTER");
    expect(mockJobUpdate).toHaveBeenCalledWith({
      where: { id: "job-abc" },
      data: {
        status: "DEAD_LETTER",
        failedAt: NOW,
        lastError: "permanent failure",
        lockedAt: null,
        lockedBy: null,
      },
    });
  });

  it("debe lanzar error si el job no existe", async () => {
    mockJobFindUnique.mockResolvedValueOnce(null);

    await expect(
      markFailed({ jobId: "ghost", error: "x", now: NOW }),
    ).rejects.toThrow("Job no existe: ghost");
  });

  it("debe lanzar error si el job no está IN_PROGRESS", async () => {
    mockJobFindUnique.mockResolvedValueOnce(fakeJob({ status: "PENDING" }));

    await expect(
      markFailed({ jobId: "job-abc", error: "x", now: NOW }),
    ).rejects.toThrow("Job no está IN_PROGRESS: job-abc");
  });

  it("debe lanzar error si workerId no coincide con lockedBy", async () => {
    mockJobFindUnique.mockResolvedValueOnce(
      fakeJob({ status: "IN_PROGRESS", lockedBy: "w1" }),
    );

    await expect(
      markFailed({
        jobId: "job-abc",
        workerId: "w2",
        error: "x",
        now: NOW,
      }),
    ).rejects.toThrow("Job lock no pertenece al worker: job-abc");
  });

  it("debe permitir fallar sin verificación de workerId", async () => {
    const job = fakeJob({
      status: "IN_PROGRESS",
      attempts: 1,
      maxAttempts: 3,
      lockedBy: "w1",
    });
    mockJobFindUnique.mockResolvedValueOnce(job);
    mockJobUpdate.mockResolvedValueOnce(fakeJob({ status: "PENDING" }));

    const result = await markFailed({
      jobId: "job-abc",
      error: "recoverable",
      now: NOW,
      retryDelayMs: 0,
    });

    expect(result.status).toBe("PENDING");
  });

  it("debe calcular backoff exponencial cuando no se proporciona retryDelayMs", async () => {
    const job = fakeJob({
      status: "IN_PROGRESS",
      attempts: 2,
      maxAttempts: 5,
      lockedBy: "w1",
    });
    mockJobFindUnique.mockResolvedValueOnce(job);
    mockJobUpdate.mockResolvedValueOnce(fakeJob({ status: "PENDING" }));

    await markFailed({
      jobId: "job-abc",
      workerId: "w1",
      error: "timeout",
      now: NOW,
    });

    // computeBackoffMs(max(1, 2)) = 1000 * 2^(2-1) = 2000ms
    const updateData = mockJobUpdate.mock.calls[0][0].data;
    expect(updateData.availableAt).toEqual(new Date(NOW.getTime() + 2000));
  });

  it("debe limitar backoff exponencial a 60 segundos máximo", async () => {
    const job = fakeJob({
      status: "IN_PROGRESS",
      attempts: 7,
      maxAttempts: 10,
      lockedBy: "w1",
    });
    mockJobFindUnique.mockResolvedValueOnce(job);
    mockJobUpdate.mockResolvedValueOnce(fakeJob({ status: "PENDING" }));

    await markFailed({
      jobId: "job-abc",
      workerId: "w1",
      error: "timeout",
      now: NOW,
    });

    // computeBackoffMs(7) = 1000 * 2^6 = 64000 → capped a 60000
    const updateData = mockJobUpdate.mock.calls[0][0].data;
    expect(updateData.availableAt).toEqual(new Date(NOW.getTime() + 60_000));
  });

  it("debe usar backoff de 1s para el primer intento", async () => {
    const job = fakeJob({
      status: "IN_PROGRESS",
      attempts: 1,
      maxAttempts: 5,
      lockedBy: "w1",
    });
    mockJobFindUnique.mockResolvedValueOnce(job);
    mockJobUpdate.mockResolvedValueOnce(fakeJob({ status: "PENDING" }));

    await markFailed({
      jobId: "job-abc",
      workerId: "w1",
      error: "transient",
      now: NOW,
    });

    // computeBackoffMs(max(1, 1)) = 1000 * 2^0 = 1000ms
    const updateData = mockJobUpdate.mock.calls[0][0].data;
    expect(updateData.availableAt).toEqual(new Date(NOW.getTime() + 1000));
  });

  it("debe mover a DEAD_LETTER con maxAttempts=1 tras primer fallo", async () => {
    const job = fakeJob({
      status: "IN_PROGRESS",
      attempts: 1,
      maxAttempts: 1,
      lockedBy: "w1",
    });
    mockJobFindUnique.mockResolvedValueOnce(job);
    mockJobUpdate.mockResolvedValueOnce(fakeJob({ status: "DEAD_LETTER" }));

    const result = await markFailed({
      jobId: "job-abc",
      workerId: "w1",
      error: "fatal",
      now: NOW,
    });

    expect(result.status).toBe("DEAD_LETTER");
  });

  it("debe usar retryDelayMs=0 para reintento inmediato", async () => {
    const job = fakeJob({
      status: "IN_PROGRESS",
      attempts: 1,
      maxAttempts: 3,
      lockedBy: "w1",
    });
    mockJobFindUnique.mockResolvedValueOnce(job);
    mockJobUpdate.mockResolvedValueOnce(fakeJob({ status: "PENDING" }));

    await markFailed({
      jobId: "job-abc",
      workerId: "w1",
      error: "retry",
      now: NOW,
      retryDelayMs: 0,
    });

    const updateData = mockJobUpdate.mock.calls[0][0].data;
    expect(updateData.availableAt).toEqual(NOW);
  });
});
