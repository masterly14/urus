import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventType } from "@/app/generated/prisma/client";
import type { EventRecord } from "@/lib/event-store/types";
import type { JobRecord } from "@/lib/job-queue/types";

const { dequeueJobMock, enqueueJobMock, markCompletedMock, markFailedMock } =
  vi.hoisted(() => ({
    dequeueJobMock: vi.fn(),
    enqueueJobMock: vi.fn(),
    markCompletedMock: vi.fn(),
    markFailedMock: vi.fn(),
  }));

const { findUniqueMock } = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
}));

vi.mock("@/lib/job-queue", () => ({
  dequeueJob: dequeueJobMock,
  enqueueJob: enqueueJobMock,
  markCompleted: markCompletedMock,
  markFailed: markFailedMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: {
      findUnique: findUniqueMock,
    },
  },
}));

import { runConsumerCycle, runConsumerLoop } from "../consumer";

function makeJob(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: "job-001",
    type: "PROCESS_EVENT",
    status: "IN_PROGRESS",
    payload: { eventId: "evt-001", eventType: "PROPIEDAD_CREADA" },
    priority: 100,
    attempts: 1,
    maxAttempts: 5,
    availableAt: new Date(),
    lockedAt: new Date(),
    lockedBy: "test-worker",
    startedAt: new Date(),
    completedAt: null,
    failedAt: null,
    lastError: null,
    idempotencyKey: "process-event:evt-001",
    sourceEventId: "evt-001",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeEvent(
  type: EventType = "PROPIEDAD_CREADA",
  overrides: Partial<EventRecord> = {},
): EventRecord {
  return {
    id: "evt-001",
    position: BigInt(1),
    type,
    aggregateType: "PROPERTY",
    aggregateId: "prop-123",
    version: null,
    payload: { snapshot: {} },
    metadata: null,
    correlationId: null,
    causationId: null,
    occurredAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

const WORKER_ID = "test-worker";

describe("runConsumerCycle", () => {
  beforeEach(() => {
    dequeueJobMock.mockReset();
    enqueueJobMock.mockReset();
    markCompletedMock.mockReset();
    markFailedMock.mockReset();
    findUniqueMock.mockReset();
  });

  it("debe retornar noWork=true si no hay jobs en la cola", async () => {
    dequeueJobMock.mockResolvedValue({ job: null });

    const result = await runConsumerCycle({ workerId: WORKER_ID });

    expect(result.noWork).toBe(true);
    expect(result.processed).toBe(0);
    expect(result.failed).toBe(0);
    expect(markCompletedMock).not.toHaveBeenCalled();
    expect(markFailedMock).not.toHaveBeenCalled();
  });

  it("debe procesar un job PROCESS_EVENT exitosamente y encolar follow-up", async () => {
    const job = makeJob();
    const event = makeEvent();

    dequeueJobMock.mockResolvedValue({ job });
    findUniqueMock.mockResolvedValue(event);
    enqueueJobMock.mockResolvedValue({});
    markCompletedMock.mockResolvedValue({});

    const result = await runConsumerCycle({ workerId: WORKER_ID });

    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.noWork).toBe(false);

    expect(findUniqueMock).toHaveBeenCalledWith({ where: { id: "evt-001" } });
    expect(markCompletedMock).toHaveBeenCalledWith({
      jobId: "job-001",
      workerId: WORKER_ID,
    });

    expect(enqueueJobMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "UPDATE_PROPERTY_PROJECTION" }),
    );
  });

  it("debe marcar FAILED si sourceEventId no apunta a un evento existente", async () => {
    const job = makeJob();
    dequeueJobMock.mockResolvedValue({ job });
    findUniqueMock.mockResolvedValue(null);
    markFailedMock.mockResolvedValue({});

    const result = await runConsumerCycle({ workerId: WORKER_ID });

    expect(result.failed).toBe(1);
    expect(result.processed).toBe(0);
    expect(markFailedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-001",
        workerId: WORKER_ID,
      }),
    );
  });

  it("debe marcar FAILED si el job no tiene sourceEventId ni payload.eventId", async () => {
    const job = makeJob({ sourceEventId: null, payload: {} });
    dequeueJobMock.mockResolvedValue({ job });
    markFailedMock.mockResolvedValue({});

    const result = await runConsumerCycle({ workerId: WORKER_ID });

    expect(result.failed).toBe(1);
    expect(markFailedMock).toHaveBeenCalled();
  });

  it("debe marcar COMPLETED (no-op) si no hay handler para el tipo de evento", async () => {
    const job = makeJob({ sourceEventId: "evt-unknown" });
    const event = makeEvent("NO_EXISTE_TYPE" as EventType, { id: "evt-unknown" });

    dequeueJobMock.mockResolvedValue({ job });
    findUniqueMock.mockResolvedValue(event);
    markCompletedMock.mockResolvedValue({});

    const result = await runConsumerCycle({ workerId: WORKER_ID });

    expect(result.processed).toBe(1);
    expect(markCompletedMock).toHaveBeenCalledWith({
      jobId: "job-001",
      workerId: WORKER_ID,
    });
  });

  it("debe marcar FAILED si el handler lanza una excepción", async () => {
    const job = makeJob();
    const event = makeEvent();

    dequeueJobMock.mockResolvedValue({ job });
    findUniqueMock.mockResolvedValue(event);
    markFailedMock.mockResolvedValue({});

    const { registerHandler } = await import("../handlers");
    registerHandler("PROPIEDAD_CREADA", async () => {
      throw new Error("handler explosion");
    });

    const result = await runConsumerCycle({ workerId: WORKER_ID });

    expect(result.failed).toBe(1);
    expect(markFailedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-001",
        error: "handler explosion",
      }),
    );

    registerHandler("PROPIEDAD_CREADA", async (evt) => ({
      success: true,
      followUpJobs: [
        {
          type: "UPDATE_PROPERTY_PROJECTION" as const,
          payload: { eventId: evt.id },
          idempotencyKey: `update_property_projection:${evt.id}`,
          sourceEventId: evt.id,
        },
      ],
    }));
  });
});

describe("runConsumerLoop", () => {
  beforeEach(() => {
    dequeueJobMock.mockReset();
    enqueueJobMock.mockReset();
    markCompletedMock.mockReset();
    markFailedMock.mockReset();
    findUniqueMock.mockReset();
  });

  it("debe terminar tras 3 ciclos consecutivos sin trabajo", async () => {
    dequeueJobMock.mockResolvedValue({ job: null });

    const result = await runConsumerLoop({
      workerId: WORKER_ID,
      maxCycles: 10,
      pollIntervalMs: 10,
    });

    expect(result.totalProcessed).toBe(0);
    expect(result.totalFailed).toBe(0);
    expect(result.cycles).toBe(3);
  });

  it("debe procesar varios jobs hasta maxCycles", async () => {
    const job = makeJob();
    const event = makeEvent();

    let callCount = 0;
    dequeueJobMock.mockImplementation(() => {
      callCount++;
      if (callCount <= 3) return { job };
      return { job: null };
    });
    findUniqueMock.mockResolvedValue(event);
    enqueueJobMock.mockResolvedValue({});
    markCompletedMock.mockResolvedValue({});

    const result = await runConsumerLoop({
      workerId: WORKER_ID,
      maxCycles: 10,
      pollIntervalMs: 10,
    });

    expect(result.totalProcessed).toBe(3);
    expect(result.cycles).toBeGreaterThanOrEqual(3);
  });

  it("debe respetar maxCycles como límite superior", async () => {
    const job = makeJob();
    const event = makeEvent();

    dequeueJobMock.mockResolvedValue({ job });
    findUniqueMock.mockResolvedValue(event);
    enqueueJobMock.mockResolvedValue({});
    markCompletedMock.mockResolvedValue({});

    const result = await runConsumerLoop({
      workerId: WORKER_ID,
      maxCycles: 5,
      pollIntervalMs: 10,
    });

    expect(result.cycles).toBe(5);
    expect(result.totalProcessed).toBe(5);
  });
});
