import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventRecord } from "@/lib/event-store/types";
import type { JobRecord } from "@/lib/job-queue/types";

const { dequeueJobMock, markCompletedMock, markFailedMock } = vi.hoisted(() => ({
  dequeueJobMock: vi.fn(),
  markCompletedMock: vi.fn(),
  markFailedMock: vi.fn(),
}));

const { findUniqueEventMock, findUniqueCheckpointMock, upsertCheckpointMock } = vi.hoisted(() => ({
  findUniqueEventMock: vi.fn(),
  findUniqueCheckpointMock: vi.fn(),
  upsertCheckpointMock: vi.fn(),
}));

const { applyPropertyMock, applyDemandMock } = vi.hoisted(() => ({
  applyPropertyMock: vi.fn(),
  applyDemandMock: vi.fn(),
}));

vi.mock("@/lib/job-queue", () => ({
  dequeueJob: dequeueJobMock,
  markCompleted: markCompletedMock,
  markFailed: markFailedMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: { findUnique: findUniqueEventMock },
    projectionCheckpoint: {
      findUnique: findUniqueCheckpointMock,
      upsert: upsertCheckpointMock,
    },
  },
}));

vi.mock("../property-projection", () => ({
  applyPropertyProjection: applyPropertyMock,
}));

vi.mock("../demand-projection", () => ({
  applyDemandProjection: applyDemandMock,
}));

import { runProjectionCycle, runProjectionLoop } from "../projection-worker";

function makeJob(type: "UPDATE_PROPERTY_PROJECTION" | "UPDATE_DEMAND_PROJECTION", overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: "job-proj-001",
    type,
    status: "IN_PROGRESS",
    payload: { eventId: "evt-001" },
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
    idempotencyKey: null,
    sourceEventId: "evt-001",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeEvent(type: string = "PROPIEDAD_CREADA"): EventRecord {
  return {
    id: "evt-001",
    position: BigInt(10),
    type: type as EventRecord["type"],
    aggregateType: "PROPERTY",
    aggregateId: "prop-123",
    version: null,
    payload: { snapshot: {} },
    metadata: null,
    correlationId: null,
    causationId: null,
    occurredAt: new Date("2026-03-14T10:00:00Z"),
    createdAt: new Date("2026-03-14T10:00:00Z"),
  };
}

const WORKER_ID = "test-worker";

describe("runProjectionCycle", () => {
  beforeEach(() => {
    dequeueJobMock.mockReset();
    markCompletedMock.mockReset();
    markFailedMock.mockReset();
    findUniqueEventMock.mockReset();
    findUniqueCheckpointMock.mockReset();
    upsertCheckpointMock.mockReset();
    applyPropertyMock.mockReset();
    applyDemandMock.mockReset();
  });

  it("debe retornar noWork=true si no hay jobs", async () => {
    dequeueJobMock.mockResolvedValue({ job: null });

    const result = await runProjectionCycle({ workerId: WORKER_ID });

    expect(result.noWork).toBe(true);
    expect(result.processed).toBe(0);
  });

  it("debe procesar UPDATE_PROPERTY_PROJECTION exitosamente", async () => {
    const job = makeJob("UPDATE_PROPERTY_PROJECTION");
    const event = makeEvent("PROPIEDAD_CREADA");

    dequeueJobMock.mockResolvedValue({ job });
    findUniqueEventMock.mockResolvedValue(event);
    applyPropertyMock.mockResolvedValue({ success: true, aggregateId: "prop-123" });
    findUniqueCheckpointMock.mockResolvedValue(null);
    upsertCheckpointMock.mockResolvedValue({});
    markCompletedMock.mockResolvedValue({});

    const result = await runProjectionCycle({ workerId: WORKER_ID });

    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);
    expect(applyPropertyMock).toHaveBeenCalledWith(event);
    expect(markCompletedMock).toHaveBeenCalledWith({
      jobId: "job-proj-001",
      workerId: WORKER_ID,
    });
  });

  it("debe procesar UPDATE_DEMAND_PROJECTION exitosamente", async () => {
    const job = makeJob("UPDATE_DEMAND_PROJECTION");
    const event = makeEvent("DEMANDA_CREADA");

    dequeueJobMock.mockResolvedValue({ job });
    findUniqueEventMock.mockResolvedValue({ ...event, aggregateType: "DEMAND", aggregateId: "dem-456" });
    applyDemandMock.mockResolvedValue({ success: true, aggregateId: "dem-456" });
    findUniqueCheckpointMock.mockResolvedValue(null);
    upsertCheckpointMock.mockResolvedValue({});
    markCompletedMock.mockResolvedValue({});

    const result = await runProjectionCycle({ workerId: WORKER_ID });

    expect(result.processed).toBe(1);
    expect(applyDemandMock).toHaveBeenCalled();
    expect(markCompletedMock).toHaveBeenCalled();
  });

  it("debe marcar FAILED si el evento no existe", async () => {
    const job = makeJob("UPDATE_PROPERTY_PROJECTION");
    dequeueJobMock.mockResolvedValue({ job });
    findUniqueEventMock.mockResolvedValue(null);
    markFailedMock.mockResolvedValue({});

    const result = await runProjectionCycle({ workerId: WORKER_ID });

    expect(result.failed).toBe(1);
    expect(markFailedMock).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "job-proj-001" }),
    );
  });

  it("debe marcar FAILED si la proyección falla", async () => {
    const job = makeJob("UPDATE_PROPERTY_PROJECTION");
    const event = makeEvent();

    dequeueJobMock.mockResolvedValue({ job });
    findUniqueEventMock.mockResolvedValue(event);
    applyPropertyMock.mockResolvedValue({
      success: false,
      aggregateId: "prop-123",
      error: "Payload sin snapshot",
    });
    markFailedMock.mockResolvedValue({});

    const result = await runProjectionCycle({ workerId: WORKER_ID });

    expect(result.failed).toBe(1);
    expect(markFailedMock).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Payload sin snapshot" }),
    );
  });

  it("debe marcar FAILED si el job no tiene referencia a evento", async () => {
    const job = makeJob("UPDATE_PROPERTY_PROJECTION", {
      sourceEventId: null,
      payload: {},
    });
    dequeueJobMock.mockResolvedValue({ job });
    markFailedMock.mockResolvedValue({});

    const result = await runProjectionCycle({ workerId: WORKER_ID });

    expect(result.failed).toBe(1);
  });

  it("no debe avanzar checkpoint si la posición es menor que la actual", async () => {
    const job = makeJob("UPDATE_PROPERTY_PROJECTION");
    const event = makeEvent();

    dequeueJobMock.mockResolvedValue({ job });
    findUniqueEventMock.mockResolvedValue(event);
    applyPropertyMock.mockResolvedValue({ success: true, aggregateId: "prop-123" });
    findUniqueCheckpointMock.mockResolvedValue({
      projectionName: "PROPERTIES_CURRENT",
      lastEventPosition: BigInt(100),
    });
    markCompletedMock.mockResolvedValue({});

    const result = await runProjectionCycle({ workerId: WORKER_ID });

    expect(result.processed).toBe(1);
    expect(upsertCheckpointMock).not.toHaveBeenCalled();
  });
});

describe("runProjectionLoop", () => {
  beforeEach(() => {
    dequeueJobMock.mockReset();
    markCompletedMock.mockReset();
    markFailedMock.mockReset();
    findUniqueEventMock.mockReset();
    findUniqueCheckpointMock.mockReset();
    upsertCheckpointMock.mockReset();
    applyPropertyMock.mockReset();
    applyDemandMock.mockReset();
  });

  it("debe terminar tras 3 ciclos sin trabajo", async () => {
    dequeueJobMock.mockResolvedValue({ job: null });

    const result = await runProjectionLoop({
      workerId: WORKER_ID,
      maxCycles: 10,
      pollIntervalMs: 10,
    });

    expect(result.totalProcessed).toBe(0);
    expect(result.cycles).toBe(3);
  });

  it("debe procesar varios jobs hasta maxCycles", async () => {
    const job = makeJob("UPDATE_PROPERTY_PROJECTION");
    const event = makeEvent();

    let callCount = 0;
    dequeueJobMock.mockImplementation(() => {
      callCount++;
      if (callCount <= 2) return { job };
      return { job: null };
    });
    findUniqueEventMock.mockResolvedValue(event);
    applyPropertyMock.mockResolvedValue({ success: true, aggregateId: "prop-123" });
    findUniqueCheckpointMock.mockResolvedValue(null);
    upsertCheckpointMock.mockResolvedValue({});
    markCompletedMock.mockResolvedValue({});

    const result = await runProjectionLoop({
      workerId: WORKER_ID,
      maxCycles: 10,
      pollIntervalMs: 10,
    });

    expect(result.totalProcessed).toBe(2);
    expect(result.cycles).toBeGreaterThanOrEqual(2);
  });
});
