import { describe, it, expect, vi, beforeEach } from "vitest";

const mockOperacionFindUnique = vi.fn();
const mockOperacionUpdate = vi.fn();
const mockAppendEvent = vi.fn();
const mockEnqueueJob = vi.fn();
const mockSyncLeadStatus = vi.fn();
const mockResolveBuyerCode = vi.fn();
const mockExtractDemandArgs = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    operacion: {
      findUnique: (...args: unknown[]) => mockOperacionFindUnique(...args),
      update: (...args: unknown[]) => mockOperacionUpdate(...args),
    },
  },
}));
vi.mock("@/lib/event-store", () => ({
  appendEvent: (...args: unknown[]) => mockAppendEvent(...args),
}));
vi.mock("@/lib/job-queue", () => ({
  enqueueJob: (...args: unknown[]) => mockEnqueueJob(...args),
}));
vi.mock("../sync-lead-status", () => ({
  syncLeadStatusFromOperacion: (...args: unknown[]) => mockSyncLeadStatus(...args),
}));
vi.mock("../resolve-buyer-client-code", () => ({
  resolveBuyerClientCode: (...args: unknown[]) => mockResolveBuyerCode(...args),
}));
vi.mock("../extract-demand-write-args", () => ({
  extractDemandWriteArgs: (...args: unknown[]) => mockExtractDemandArgs(...args),
}));

import { closeOperacion, cancelOperacion } from "../close";

const BASE_OPERACION = {
  id: "op-001",
  codigo: "OP-2026-0001",
  propertyCode: "URUS100VMA",
  estado: "ARRAS" as const,
  demandId: "DEM-001",
  buyerClientId: "12345",
  sellerClientId: null,
  comercialId: "com-001",
  ciudad: "Madrid",
  closedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockOperacionFindUnique.mockResolvedValue(BASE_OPERACION);
  mockOperacionUpdate.mockResolvedValue({ ...BASE_OPERACION, estado: "CERRADA_VENTA" });
  mockAppendEvent.mockResolvedValue({ id: "evt-001" });
  mockEnqueueJob.mockResolvedValue(undefined);
  mockSyncLeadStatus.mockResolvedValue(undefined);
  mockResolveBuyerCode.mockResolvedValue("12345");
  mockExtractDemandArgs.mockResolvedValue({
    demandId: "DEM-001",
    demandRef: "REF-001",
    clientId: "12345",
    agentId: "AG-01",
    propertyTypes: "Piso",
  });
});

describe("closeOperacion", () => {
  it("returns error when operacion not found", async () => {
    mockOperacionFindUnique.mockResolvedValue(null);
    const result = await closeOperacion({
      operacionId: "op-missing",
      tipoCierre: "CERRADA_VENTA",
      comercialId: "com-001",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("no encontrada");
  });

  it("returns error when operacion is already terminal", async () => {
    mockOperacionFindUnique.mockResolvedValue({ ...BASE_OPERACION, estado: "CANCELADA" });
    const result = await closeOperacion({
      operacionId: "op-001",
      tipoCierre: "CERRADA_VENTA",
      comercialId: "com-001",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("terminal");
  });

  it("enqueues UPDATE_PROPERTY_STATUS_INMOVILLA with buyerClientCode when resolved", async () => {
    mockResolveBuyerCode.mockResolvedValue("12345");

    const result = await closeOperacion({
      operacionId: "op-001",
      tipoCierre: "CERRADA_VENTA",
      comercialId: "com-001",
    });

    expect(result.ok).toBe(true);

    const propertyStatusCall = mockEnqueueJob.mock.calls.find(
      (c: unknown[]) => (c[0] as { type: string }).type === "UPDATE_PROPERTY_STATUS_INMOVILLA",
    );
    expect(propertyStatusCall).toBeDefined();
    const payload = (propertyStatusCall![0] as { payload: Record<string, unknown> }).payload;
    expect(payload.estadoficha).toBe(3);
    expect(payload.buyerClientCode).toBe("12345");
    expect(payload.propertyCode).toBe("URUS100VMA");
  });

  it("enqueues UPDATE_PROPERTY_STATUS_INMOVILLA without buyerClientCode when not resolved", async () => {
    mockResolveBuyerCode.mockResolvedValue(null);

    await closeOperacion({
      operacionId: "op-001",
      tipoCierre: "CERRADA_VENTA",
      comercialId: "com-001",
    });

    const propertyStatusCall = mockEnqueueJob.mock.calls.find(
      (c: unknown[]) => (c[0] as { type: string }).type === "UPDATE_PROPERTY_STATUS_INMOVILLA",
    );
    const payload = (propertyStatusCall![0] as { payload: Record<string, unknown> }).payload;
    expect(payload.buyerClientCode).toBeUndefined();
  });

  it("enqueues WRITE_TO_INMOVILLA demand deactivation when demandId exists", async () => {
    await closeOperacion({
      operacionId: "op-001",
      tipoCierre: "CERRADA_VENTA",
      comercialId: "com-001",
    });

    const deactivateCall = mockEnqueueJob.mock.calls.find(
      (c: unknown[]) => (c[0] as { type: string }).type === "WRITE_TO_INMOVILLA",
    );
    expect(deactivateCall).toBeDefined();
    const payload = (deactivateCall![0] as { payload: Record<string, unknown> }).payload;
    expect(payload).toMatchObject({
      operation: "updateDemandStatus",
      args: expect.objectContaining({
        demandId: "DEM-001",
        keysitu: "26",
      }),
    });
  });

  it("skips demand deactivation when no demandId", async () => {
    mockOperacionFindUnique.mockResolvedValue({ ...BASE_OPERACION, demandId: null });

    await closeOperacion({
      operacionId: "op-001",
      tipoCierre: "CERRADA_VENTA",
      comercialId: "com-001",
    });

    const writeInmovillaCall = mockEnqueueJob.mock.calls.find(
      (c: unknown[]) => (c[0] as { type: string }).type === "WRITE_TO_INMOVILLA",
    );
    expect(writeInmovillaCall).toBeUndefined();
  });

  it("skips demand deactivation when extractDemandWriteArgs returns null", async () => {
    mockExtractDemandArgs.mockResolvedValue(null);

    await closeOperacion({
      operacionId: "op-001",
      tipoCierre: "CERRADA_VENTA",
      comercialId: "com-001",
    });

    const writeInmovillaCall = mockEnqueueJob.mock.calls.find(
      (c: unknown[]) => (c[0] as { type: string }).type === "WRITE_TO_INMOVILLA",
    );
    expect(writeInmovillaCall).toBeUndefined();
  });

  it("enqueues START_POSTVENTA_CADENCE", async () => {
    await closeOperacion({
      operacionId: "op-001",
      tipoCierre: "CERRADA_VENTA",
      comercialId: "com-001",
    });

    const postventaCall = mockEnqueueJob.mock.calls.find(
      (c: unknown[]) => (c[0] as { type: string }).type === "START_POSTVENTA_CADENCE",
    );
    expect(postventaCall).toBeDefined();
  });

  it("enqueues 3 jobs total when demandId exists and demandArgs resolve", async () => {
    await closeOperacion({
      operacionId: "op-001",
      tipoCierre: "CERRADA_VENTA",
      comercialId: "com-001",
    });

    expect(mockEnqueueJob).toHaveBeenCalledTimes(3);
    const jobTypes = mockEnqueueJob.mock.calls.map(
      (c: unknown[]) => (c[0] as { type: string }).type,
    );
    expect(jobTypes).toContain("UPDATE_PROPERTY_STATUS_INMOVILLA");
    expect(jobTypes).toContain("WRITE_TO_INMOVILLA");
    expect(jobTypes).toContain("START_POSTVENTA_CADENCE");
  });

  it("enqueues 2 jobs when no demandId (no demand deactivation)", async () => {
    mockOperacionFindUnique.mockResolvedValue({ ...BASE_OPERACION, demandId: null });

    await closeOperacion({
      operacionId: "op-001",
      tipoCierre: "CERRADA_VENTA",
      comercialId: "com-001",
    });

    expect(mockEnqueueJob).toHaveBeenCalledTimes(2);
  });

  it("maps CERRADA_ALQUILER to estadoficha=2", async () => {
    await closeOperacion({
      operacionId: "op-001",
      tipoCierre: "CERRADA_ALQUILER",
      comercialId: "com-001",
    });

    const propertyStatusCall = mockEnqueueJob.mock.calls.find(
      (c: unknown[]) => (c[0] as { type: string }).type === "UPDATE_PROPERTY_STATUS_INMOVILLA",
    );
    const payload = (propertyStatusCall![0] as { payload: Record<string, unknown> }).payload;
    expect(payload.estadoficha).toBe(2);
  });

  it("maps CERRADA_TRASPASO to estadoficha=6", async () => {
    await closeOperacion({
      operacionId: "op-001",
      tipoCierre: "CERRADA_TRASPASO",
      comercialId: "com-001",
    });

    const propertyStatusCall = mockEnqueueJob.mock.calls.find(
      (c: unknown[]) => (c[0] as { type: string }).type === "UPDATE_PROPERTY_STATUS_INMOVILLA",
    );
    const payload = (propertyStatusCall![0] as { payload: Record<string, unknown> }).payload;
    expect(payload.estadoficha).toBe(6);
  });

  it("uses demandId from params over operacion when provided", async () => {
    await closeOperacion({
      operacionId: "op-001",
      tipoCierre: "CERRADA_VENTA",
      demandId: "DEM-OVERRIDE",
      comercialId: "com-001",
    });

    expect(mockResolveBuyerCode).toHaveBeenCalledWith(
      "12345",
      "DEM-OVERRIDE",
    );
  });

  it("calls syncLeadStatusFromOperacion", async () => {
    await closeOperacion({
      operacionId: "op-001",
      tipoCierre: "CERRADA_VENTA",
      comercialId: "com-001",
    });

    expect(mockSyncLeadStatus).toHaveBeenCalledWith("op-001", "CERRADA_VENTA");
  });
});

describe("cancelOperacion", () => {
  it("cancels and does not enqueue any jobs", async () => {
    const result = await cancelOperacion("op-001", "com-001");
    expect(result.ok).toBe(true);
    expect(mockEnqueueJob).not.toHaveBeenCalled();
    expect(mockSyncLeadStatus).not.toHaveBeenCalled();
  });

  it("returns error when operacion not found", async () => {
    mockOperacionFindUnique.mockResolvedValue(null);
    const result = await cancelOperacion("op-missing", "com-001");
    expect(result.ok).toBe(false);
  });

  it("returns error when already terminal", async () => {
    mockOperacionFindUnique.mockResolvedValue({ ...BASE_OPERACION, estado: "CERRADA_VENTA" });
    const result = await cancelOperacion("op-001", "com-001");
    expect(result.ok).toBe(false);
  });
});
