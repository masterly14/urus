import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/event-store", () => ({
  appendEvent: vi.fn(),
}));
vi.mock("@/lib/job-queue", () => ({
  enqueueJob: vi.fn(),
}));

import { emitLeadIngestado } from "../ingest";
import { appendEvent } from "@/lib/event-store";
import { enqueueJob } from "@/lib/job-queue";

const mockAppendEvent = vi.mocked(appendEvent);
const mockEnqueueJob = vi.mocked(enqueueJob);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("emitLeadIngestado", () => {
  it("crea evento LEAD_INGESTADO y encola PROCESS_EVENT", async () => {
    mockAppendEvent.mockResolvedValue({
      id: "evt-001",
      position: BigInt(1),
      type: "LEAD_INGESTADO",
      aggregateType: "LEAD",
      aggregateId: "lead-abc",
      version: null,
      payload: {},
      metadata: null,
      correlationId: null,
      causationId: null,
      occurredAt: new Date(),
      createdAt: new Date(),
    });
    mockEnqueueJob.mockResolvedValue({
      id: "job-001",
      type: "PROCESS_EVENT",
      status: "PENDING",
      payload: {},
      priority: 100,
      attempts: 0,
      maxAttempts: 5,
      availableAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      startedAt: null,
      completedAt: null,
      failedAt: null,
      lastError: null,
      idempotencyKey: null,
      sourceEventId: "evt-001",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await emitLeadIngestado({
      tipo: "comprador",
      ciudad: "Córdoba",
      preaprobacionHipotecaria: true,
    });

    expect(result.eventId).toBe("evt-001");
    expect(result.aggregateId).toMatch(/^lead-/);

    expect(mockAppendEvent).toHaveBeenCalledTimes(1);
    expect(mockAppendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "LEAD_INGESTADO",
        aggregateType: "LEAD",
        payload: expect.objectContaining({
          tipo: "comprador",
          ciudad: "Córdoba",
          preaprobacionHipotecaria: true,
        }),
      }),
    );

    expect(mockEnqueueJob).toHaveBeenCalledTimes(1);
    expect(mockEnqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "PROCESS_EVENT",
        payload: { eventId: "evt-001" },
        sourceEventId: "evt-001",
        idempotencyKey: "process_event:evt-001",
      }),
    );
  });

  it("genera aggregateId único para cada llamada", async () => {
    mockAppendEvent.mockResolvedValue({
      id: "evt-002",
      position: BigInt(2),
      type: "LEAD_INGESTADO",
      aggregateType: "LEAD",
      aggregateId: "lead-xyz",
      version: null,
      payload: {},
      metadata: null,
      correlationId: null,
      causationId: null,
      occurredAt: new Date(),
      createdAt: new Date(),
    });
    mockEnqueueJob.mockResolvedValue({
      id: "job-002",
      type: "PROCESS_EVENT",
      status: "PENDING",
      payload: {},
      priority: 100,
      attempts: 0,
      maxAttempts: 5,
      availableAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      startedAt: null,
      completedAt: null,
      failedAt: null,
      lastError: null,
      idempotencyKey: null,
      sourceEventId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const r1 = await emitLeadIngestado({ tipo: "comprador", ciudad: "Madrid" });
    const r2 = await emitLeadIngestado({ tipo: "propietario", ciudad: "Sevilla" });

    const agg1 = (mockAppendEvent.mock.calls[0][0] as { aggregateId: string }).aggregateId;
    const agg2 = (mockAppendEvent.mock.calls[1][0] as { aggregateId: string }).aggregateId;
    expect(agg1).not.toBe(agg2);
  });

  it("propaga error de appendEvent", async () => {
    mockAppendEvent.mockRejectedValue(new Error("DB error"));

    await expect(
      emitLeadIngestado({ tipo: "comprador", ciudad: "Córdoba" }),
    ).rejects.toThrow("DB error");

    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });
});
