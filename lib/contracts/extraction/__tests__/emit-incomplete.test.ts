import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/event-store/event-store", () => ({
  appendEvent: vi.fn(),
}));

vi.mock("@/lib/job-queue", () => ({
  enqueueJob: vi.fn(),
}));

import { emitContractDataIncomplete } from "../emit-incomplete";
import { appendEvent } from "@/lib/event-store/event-store";
import { enqueueJob } from "@/lib/job-queue";
import type { ContractIncompleteValidationSignal } from "../arras-payload";

const mockAppendEvent = vi.mocked(appendEvent);
const mockEnqueueJob = vi.mocked(enqueueJob);

function buildSignal(
  overrides?: Partial<ContractIncompleteValidationSignal>,
): ContractIncompleteValidationSignal {
  return {
    event: {
      event: "DATOS_INCOMPLETOS",
      demandId: "DEM-100",
      propertyCode: "PROP-200",
      operationId: "OP-2026-001",
      documentKind: "arras",
      missingRequiredCategories: ["dni", "domicilio"],
      issues: [
        {
          event: "DATOS_INCOMPLETOS",
          documentKind: "arras",
          fieldPath: "buyers.0.nationalId",
          message: "El DNI/NIE es obligatorio.",
        },
        {
          event: "DATOS_INCOMPLETOS",
          documentKind: "arras",
          fieldPath: "buyers.0.fiscalAddress.streetLine",
          message: "La calle es obligatoria.",
        },
      ],
      ...overrides?.event,
    },
    commercialTask: {
      type: "CONTRACT_DATA_COMPLETION",
      demandId: "DEM-100",
      propertyCode: "PROP-200",
      operationId: "OP-2026-001",
      assignedCommercialId: "com-abc",
      title: "Completar datos obligatorios para contrato de arras (OP-2026-001)",
      description: "Faltan datos obligatorios para generar contrato: dni, domicilio.",
      priority: "HIGH",
      status: "PENDING",
      missingRequiredCategories: ["dni", "domicilio"],
      issues: [
        {
          event: "DATOS_INCOMPLETOS",
          documentKind: "arras",
          fieldPath: "buyers.0.nationalId",
          message: "El DNI/NIE es obligatorio.",
        },
        {
          event: "DATOS_INCOMPLETOS",
          documentKind: "arras",
          fieldPath: "buyers.0.fiscalAddress.streetLine",
          message: "La calle es obligatoria.",
        },
      ],
      ...overrides?.commercialTask,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("emitContractDataIncomplete", () => {
  it("persiste evento DATOS_INCOMPLETOS y encola job NOTIFY_CONTRACT_DATA_INCOMPLETE", async () => {
    const fakeEvent = {
      id: "evt-001",
      position: 1n,
      type: "DATOS_INCOMPLETOS" as const,
      aggregateType: "DEMAND" as const,
      aggregateId: "DEM-100",
      version: null,
      payload: {},
      metadata: null,
      correlationId: null,
      causationId: null,
      occurredAt: new Date(),
      createdAt: new Date(),
    };
    const fakeJob = {
      id: "job-001",
      type: "NOTIFY_CONTRACT_DATA_INCOMPLETE" as const,
      status: "PENDING" as const,
      payload: {},
      priority: 20,
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
    };

    mockAppendEvent.mockResolvedValue(fakeEvent);
    mockEnqueueJob.mockResolvedValue(fakeJob);

    const signal = buildSignal();
    const result = await emitContractDataIncomplete(signal);

    expect(result.event.id).toBe("evt-001");
    expect(result.job.id).toBe("job-001");

    expect(mockAppendEvent).toHaveBeenCalledTimes(1);
    expect(mockAppendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "DATOS_INCOMPLETOS",
        aggregateType: "DEMAND",
        aggregateId: "DEM-100",
      }),
    );

    const appendPayload = mockAppendEvent.mock.calls[0][0].payload as Record<string, unknown>;
    expect(appendPayload.operationId).toBe("OP-2026-001");
    expect(appendPayload.missingRequiredCategories).toEqual(["dni", "domicilio"]);
    expect(appendPayload.issueCount).toBe(2);

    expect(mockEnqueueJob).toHaveBeenCalledTimes(1);
    expect(mockEnqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "NOTIFY_CONTRACT_DATA_INCOMPLETE",
        sourceEventId: "evt-001",
        priority: 20,
      }),
    );

    const jobPayload = mockEnqueueJob.mock.calls[0][0].payload as Record<string, unknown>;
    expect(jobPayload.assignedCommercialId).toBe("com-abc");
    expect(jobPayload.demandId).toBe("DEM-100");
  });

  it("usa idempotency key basada en operationId + demandId", async () => {
    mockAppendEvent.mockResolvedValue({
      id: "evt-002",
      position: 2n,
      type: "DATOS_INCOMPLETOS" as const,
      aggregateType: "DEMAND" as const,
      aggregateId: "DEM-100",
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
      type: "NOTIFY_CONTRACT_DATA_INCOMPLETE" as const,
      status: "PENDING" as const,
      payload: {},
      priority: 20,
      attempts: 0,
      maxAttempts: 5,
      availableAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      startedAt: null,
      completedAt: null,
      failedAt: null,
      lastError: null,
      idempotencyKey: "contract_incomplete:OP-2026-001:DEM-100",
      sourceEventId: "evt-002",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const signal = buildSignal();
    await emitContractDataIncomplete(signal);

    expect(mockEnqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "contract_incomplete:OP-2026-001:DEM-100",
      }),
    );
  });
});
