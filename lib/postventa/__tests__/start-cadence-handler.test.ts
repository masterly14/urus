import { describe, it, expect, vi, beforeEach } from "vitest";

const mockEnqueueJob = vi.fn();
vi.mock("@/lib/job-queue", () => ({
  enqueueJob: (...args: unknown[]) => mockEnqueueJob(...args),
}));

import {
  handleStartPostventaCadence,
  POSTVENTA_CADENCE,
} from "../start-cadence-handler";
import type { JobRecord } from "@/lib/job-queue/types";

function makeJob(payload: unknown): JobRecord {
  return {
    id: "job-1",
    type: "START_POSTVENTA_CADENCE",
    status: "IN_PROGRESS",
    payload,
    priority: 50,
    attempts: 1,
    maxAttempts: 3,
    availableAt: new Date(),
    lockedAt: new Date(),
    lockedBy: "test-worker",
    startedAt: new Date(),
    completedAt: null,
    failedAt: null,
    lastError: null,
    idempotencyKey: null,
    sourceEventId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("handleStartPostventaCadence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("encola 5 SEND_POSTVENTA_MESSAGE con delayMs escalonado", async () => {
    const closedAt = "2026-03-15T10:00:00.000Z";
    const job = makeJob({
      propertyCode: "P-123",
      newEstado: "Vendido",
      closedAt,
      sourceEventId: "evt-1",
    });

    const result = await handleStartPostventaCadence(job);

    expect(result.success).toBe(true);
    expect(mockEnqueueJob).toHaveBeenCalledTimes(5);

    const baseTime = new Date(closedAt).getTime();

    for (let i = 0; i < POSTVENTA_CADENCE.length; i++) {
      const step = POSTVENTA_CADENCE[i];
      const call = mockEnqueueJob.mock.calls[i][0];

      expect(call.type).toBe("SEND_POSTVENTA_MESSAGE");
      expect(call.payload.propertyCode).toBe("P-123");
      expect(call.payload.step).toBe(step.label);
      expect(call.payload.template).toBe(step.template);
      expect(call.payload.requiresNoIncidencia).toBe(step.requiresNoIncidencia);
      expect(call.idempotencyKey).toBe(`postventa:P-123:${step.label}`);
      expect(call.availableAt.getTime()).toBe(baseTime + step.delayMs);
    }
  });

  it("retorna error permanente si el payload es incompleto", async () => {
    const job = makeJob({ propertyCode: "P-123" });

    const result = await handleStartPostventaCadence(job);

    expect(result.success).toBe(false);
    expect(result.permanent).toBe(true);
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("retorna error permanente si el payload es null", async () => {
    const job = makeJob(null);

    const result = await handleStartPostventaCadence(job);

    expect(result.success).toBe(false);
    expect(result.permanent).toBe(true);
  });

  it("cada step tiene idempotencyKey unica por propertyCode y label", async () => {
    const job = makeJob({
      propertyCode: "P-456",
      newEstado: "Alquilado",
      closedAt: new Date().toISOString(),
      sourceEventId: "evt-2",
    });

    await handleStartPostventaCadence(job);

    const keys = mockEnqueueJob.mock.calls.map(
      (c: unknown[]) => (c[0] as { idempotencyKey: string }).idempotencyKey,
    );
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(5);
    expect(keys.every((k: string) => k.startsWith("postventa:P-456:"))).toBe(true);
  });

  it("D0 tiene availableAt = closedAt (delay 0)", async () => {
    const closedAt = "2026-01-01T00:00:00.000Z";
    const job = makeJob({
      propertyCode: "P-789",
      newEstado: "Vendido",
      closedAt,
      sourceEventId: "evt-3",
    });

    await handleStartPostventaCadence(job);

    const d0Call = mockEnqueueJob.mock.calls[0][0];
    expect(d0Call.payload.step).toBe("D0_AGRADECIMIENTO");
    expect(d0Call.availableAt.getTime()).toBe(new Date(closedAt).getTime());
  });
});
