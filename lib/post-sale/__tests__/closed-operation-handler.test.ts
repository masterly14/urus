import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/event-store/event-store", () => ({
  appendEvent: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

import { appendEvent } from "@/lib/event-store/event-store";
import {
  handleEstadoCambiado,
  isSmartClosingTrigger,
} from "@/lib/workers/consumer/smart-closing-handler";
import { isClosedOperation } from "../closed-operation";

const mockAppendEvent = vi.mocked(appendEvent);

function fakeEvent(overrides?: Record<string, unknown>) {
  return {
    id: "evt-test-001",
    position: 1n,
    type: "ESTADO_CAMBIADO" as const,
    aggregateType: "PROPERTY" as const,
    aggregateId: "PROP-100",
    version: null,
    payload: {
      previousEstado: "Activa",
      newEstado: "Vendida",
      otherChangedFields: [],
      snapshot: { codigo: "PROP-100" },
      detectedAt: new Date().toISOString(),
    },
    metadata: null,
    correlationId: null,
    causationId: null,
    occurredAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleEstadoCambiado — operación cerrada", () => {
  it("emite OPERACION_CERRADA cuando newEstado es Vendida", async () => {
    mockAppendEvent.mockResolvedValueOnce({
      id: "evt-closed-001",
      position: 2n,
      type: "OPERACION_CERRADA",
      aggregateType: "OPERACION",
      aggregateId: "PROP-100",
      version: null,
      payload: {},
      metadata: null,
      correlationId: null,
      causationId: "evt-test-001",
      occurredAt: new Date(),
      createdAt: new Date(),
    });

    const event = fakeEvent();
    const result = await handleEstadoCambiado(event);

    expect(result.success).toBe(true);

    expect(mockAppendEvent).toHaveBeenCalledOnce();
    expect(mockAppendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "OPERACION_CERRADA",
        aggregateType: "OPERACION",
        aggregateId: "PROP-100",
        causationId: "evt-test-001",
      }),
    );

    const processEventJob = result.followUpJobs!.find(
      (j) => j.type === "PROCESS_EVENT",
    );
    expect(processEventJob).toBeDefined();
    expect(processEventJob!.sourceEventId).toBe("evt-closed-001");
  });

  it("emite OPERACION_CERRADA para Vendido (masculino)", async () => {
    mockAppendEvent.mockResolvedValueOnce({
      id: "evt-closed-002",
      position: 3n,
      type: "OPERACION_CERRADA",
      aggregateType: "OPERACION",
      aggregateId: "PROP-200",
      version: null,
      payload: {},
      metadata: null,
      correlationId: null,
      causationId: "evt-test-002",
      occurredAt: new Date(),
      createdAt: new Date(),
    });

    const event = fakeEvent({
      id: "evt-test-002",
      aggregateId: "PROP-200",
      payload: {
        previousEstado: "Reservada",
        newEstado: "Vendido",
        otherChangedFields: [],
        snapshot: { codigo: "PROP-200" },
        detectedAt: new Date().toISOString(),
      },
    });

    const result = await handleEstadoCambiado(event);

    expect(result.success).toBe(true);
    expect(mockAppendEvent).toHaveBeenCalledOnce();
    expect(mockAppendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "OPERACION_CERRADA",
        aggregateId: "PROP-200",
      }),
    );
  });

  it("emite OPERACION_CERRADA para Alquilado", async () => {
    mockAppendEvent.mockResolvedValueOnce({
      id: "evt-closed-003",
      position: 4n,
      type: "OPERACION_CERRADA",
      aggregateType: "OPERACION",
      aggregateId: "PROP-300",
      version: null,
      payload: {},
      metadata: null,
      correlationId: null,
      causationId: "evt-test-003",
      occurredAt: new Date(),
      createdAt: new Date(),
    });

    const event = fakeEvent({
      id: "evt-test-003",
      aggregateId: "PROP-300",
      payload: {
        previousEstado: "Activa",
        newEstado: "Alquilado",
        otherChangedFields: [],
        snapshot: { codigo: "PROP-300" },
        detectedAt: new Date().toISOString(),
      },
    });

    const result = await handleEstadoCambiado(event);

    expect(result.success).toBe(true);
    expect(mockAppendEvent).toHaveBeenCalledOnce();
  });

  it("NO emite OPERACION_CERRADA para Reservada (es Smart Closing, no cierre)", async () => {
    const event = fakeEvent({
      payload: {
        previousEstado: "Activa",
        newEstado: "Reservada",
        otherChangedFields: [],
        snapshot: { codigo: "PROP-100" },
        detectedAt: new Date().toISOString(),
      },
    });

    const result = await handleEstadoCambiado(event);

    expect(result.success).toBe(true);
    expect(mockAppendEvent).not.toHaveBeenCalled();

    expect(isSmartClosingTrigger("Reservada")).toBe(true);
    expect(isClosedOperation("Reservada")).toBe(false);
  });

  it("NO emite OPERACION_CERRADA para Retirada", async () => {
    const event = fakeEvent({
      payload: {
        previousEstado: "Activa",
        newEstado: "Retirada",
        otherChangedFields: [],
        snapshot: { codigo: "PROP-100" },
        detectedAt: new Date().toISOString(),
      },
    });

    const result = await handleEstadoCambiado(event);

    expect(result.success).toBe(true);
    expect(mockAppendEvent).not.toHaveBeenCalled();
    expect(result.followUpJobs).toHaveLength(1);
    expect(result.followUpJobs![0].type).toBe("UPDATE_PROPERTY_PROJECTION");
  });

  it("no interfiere con Smart Closing: Vendida no dispara GENERATE_CONTRACT_DRAFT", async () => {
    mockAppendEvent.mockResolvedValueOnce({
      id: "evt-closed-999",
      position: 5n,
      type: "OPERACION_CERRADA",
      aggregateType: "OPERACION",
      aggregateId: "PROP-100",
      version: null,
      payload: {},
      metadata: null,
      correlationId: null,
      causationId: "evt-test-001",
      occurredAt: new Date(),
      createdAt: new Date(),
    });

    const event = fakeEvent();
    const result = await handleEstadoCambiado(event);

    const jobTypes = result.followUpJobs!.map((j) => j.type);
    expect(jobTypes).toContain("UPDATE_PROPERTY_PROJECTION");
    expect(jobTypes).toContain("PROCESS_EVENT");
    expect(jobTypes).not.toContain("GENERATE_CONTRACT_DRAFT");
  });

  it("incluye payload correcto en el evento OPERACION_CERRADA", async () => {
    mockAppendEvent.mockResolvedValueOnce({
      id: "evt-closed-004",
      position: 6n,
      type: "OPERACION_CERRADA",
      aggregateType: "OPERACION",
      aggregateId: "PROP-100",
      version: null,
      payload: {},
      metadata: null,
      correlationId: null,
      causationId: "evt-test-001",
      occurredAt: new Date(),
      createdAt: new Date(),
    });

    const event = fakeEvent();
    await handleEstadoCambiado(event);

    const callPayload = mockAppendEvent.mock.calls[0][0].payload as Record<string, unknown>;
    expect(callPayload).toMatchObject({
      previousEstado: "Activa",
      newEstado: "Vendida",
      propertyCode: "PROP-100",
      sourceEstadoCambiadoEventId: "evt-test-001",
    });
    expect(callPayload.closedAt).toBeDefined();
  });
});
