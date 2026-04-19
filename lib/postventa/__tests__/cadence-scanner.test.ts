import { describe, it, expect, vi, beforeEach } from "vitest";

const mockEventFindMany = vi.fn();
const mockEventFindFirst = vi.fn();
const mockJobFindUnique = vi.fn();
const mockOperacionFindFirst = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: {
      findMany: (...args: unknown[]) => mockEventFindMany(...args),
      findFirst: (...args: unknown[]) => mockEventFindFirst(...args),
    },
    jobQueue: {
      findUnique: (...args: unknown[]) => mockJobFindUnique(...args),
    },
    operacion: {
      findFirst: (...args: unknown[]) => mockOperacionFindFirst(...args),
    },
  },
}));

const mockEnqueueJob = vi.fn();
vi.mock("@/lib/job-queue", () => ({
  enqueueJob: (...args: unknown[]) => mockEnqueueJob(...args),
}));

import { scanPostventaCadences } from "../cadence-scanner";
import { POSTVENTA_CADENCE } from "../start-cadence-handler";

function makeClosingEvent(
  aggregateId: string,
  daysAgo: number,
  newEstado = "Vendido",
) {
  return {
    id: `evt-${aggregateId}`,
    aggregateId,
    occurredAt: new Date(Date.now() - daysAgo * 86_400_000),
    payload: { previousEstado: "Activo", newEstado },
  };
}

describe("scanPostventaCadences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEventFindFirst.mockResolvedValue(null);
    mockJobFindUnique.mockResolvedValue(null);
    mockOperacionFindFirst.mockResolvedValue(null);
  });

  it("encola steps faltantes para operación cerrada", async () => {
    mockEventFindMany.mockResolvedValue([
      makeClosingEvent("P-1", 15),
    ]);

    const result = await scanPostventaCadences();

    expect(result.operationsScanned).toBe(1);
    const enqueuedSteps = mockEnqueueJob.mock.calls.map(
      (c: unknown[]) => (c[0] as { payload: { step: string } }).payload.step,
    );
    expect(enqueuedSteps).toContain("D0_AGRADECIMIENTO");
    expect(enqueuedSteps).toContain("D3_SOPORTE");
    expect(enqueuedSteps).toContain("D10_RESENA");
    expect(result.followUpsEnqueued).toBeGreaterThan(0);
  });

  it("no encola steps que aún no han llegado a su delayMs", async () => {
    mockEventFindMany.mockResolvedValue([
      makeClosingEvent("P-1", 5),
    ]);

    await scanPostventaCadences();

    const enqueuedSteps = mockEnqueueJob.mock.calls.map(
      (c: unknown[]) => (c[0] as { payload: { step: string } }).payload.step,
    );
    expect(enqueuedSteps).toContain("D0_AGRADECIMIENTO");
    expect(enqueuedSteps).toContain("D3_SOPORTE");
    expect(enqueuedSteps).not.toContain("D10_RESENA");
    expect(enqueuedSteps).not.toContain("D21_REFERIDOS");
    expect(enqueuedSteps).not.toContain("D90_RECAPTACION");
  });

  it("no encola si ya existe job con esa idempotencyKey", async () => {
    mockEventFindMany.mockResolvedValue([
      makeClosingEvent("P-1", 100),
    ]);
    mockJobFindUnique.mockResolvedValue({ id: "existing-job" });

    const result = await scanPostventaCadences();

    expect(mockEnqueueJob).not.toHaveBeenCalled();
    expect(result.operationsAlreadyCovered).toBe(1);
  });

  it("salta operaciones con incidencia abierta", async () => {
    mockEventFindMany.mockResolvedValue([
      makeClosingEvent("P-1", 30),
    ]);
    mockEventFindFirst
      .mockResolvedValueOnce({ id: "inc-1", occurredAt: new Date() })
      .mockResolvedValueOnce(null);

    const result = await scanPostventaCadences();

    expect(result.operationsPaused).toBe(1);
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("procesa operación si la incidencia fue resuelta", async () => {
    mockEventFindMany.mockResolvedValue([
      makeClosingEvent("P-1", 30),
    ]);
    mockEventFindFirst
      .mockResolvedValueOnce({ id: "inc-1", occurredAt: new Date(Date.now() - 86_400_000) })
      .mockResolvedValueOnce({ id: "res-1", occurredAt: new Date() });

    const result = await scanPostventaCadences();

    expect(result.operationsPaused).toBe(0);
    expect(result.followUpsEnqueued).toBeGreaterThan(0);
  });

  it("ignora eventos ESTADO_CAMBIADO que no son cierre", async () => {
    mockEventFindMany.mockResolvedValue([
      {
        id: "evt-1",
        aggregateId: "P-1",
        occurredAt: new Date(Date.now() - 30 * 86_400_000),
        payload: { previousEstado: "Activo", newEstado: "Reservado" },
      },
    ]);

    const result = await scanPostventaCadences();

    expect(result.operationsScanned).toBe(0);
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("deduplica operaciones por aggregateId", async () => {
    mockEventFindMany.mockResolvedValue([
      makeClosingEvent("P-1", 30),
      makeClosingEvent("P-1", 25),
    ]);

    const result = await scanPostventaCadences();

    expect(result.operationsScanned).toBe(1);
  });

  it("idempotencyKey sigue el patrón postventa:{code}:{label}", async () => {
    mockEventFindMany.mockResolvedValue([
      makeClosingEvent("P-99", 1),
    ]);

    await scanPostventaCadences();

    for (const call of mockEnqueueJob.mock.calls) {
      const input = call[0] as { idempotencyKey: string };
      expect(input.idempotencyKey).toMatch(/^postventa:P-99:D\d+_/);
    }
  });

  it("detecta Alquilado como cierre de operación", async () => {
    mockEventFindMany.mockResolvedValue([
      makeClosingEvent("P-ALQ", 5, "Alquilada"),
    ]);

    const result = await scanPostventaCadences();

    expect(result.operationsScanned).toBe(1);
    expect(result.followUpsEnqueued).toBeGreaterThan(0);
  });
});
