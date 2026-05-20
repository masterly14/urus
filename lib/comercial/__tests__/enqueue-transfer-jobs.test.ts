import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    demandSnapshot: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/job-queue", () => ({
  enqueueJob: vi.fn(),
}));

import {
  enqueueTransferJobs,
  type TransferTarget,
  type TransferProperty,
  type TransferDemand,
} from "../enqueue-transfer-jobs";
import { prisma } from "@/lib/prisma";
import { enqueueJob } from "@/lib/job-queue";

const mockEnqueue = vi.mocked(enqueueJob);
const mockFindManySnapshots = vi.mocked(prisma.demandSnapshot.findMany);

const targetWithInmovilla: TransferTarget = {
  id: "com-target-1",
  nombre: "Pedro Target",
  inmovillaAgentId: 4242,
};

const targetWithoutInmovilla: TransferTarget = {
  id: "com-orphan",
  nombre: "Sin Inmovilla",
  inmovillaAgentId: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockEnqueue.mockResolvedValue({
    id: "job-stub",
    type: "TRANSFER_PROPERTY_AGENT",
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
  } as never);
  mockFindManySnapshots.mockResolvedValue([] as never);
});

describe("enqueueTransferJobs — target sin inmovillaAgentId", () => {
  it("no encola jobs y emite warning cuando target.inmovillaAgentId es null", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const properties: TransferProperty[] = [
      { codigo: "P-1", ref: "REF-1" },
      { codigo: "P-2", ref: "REF-2" },
    ];
    const demands: TransferDemand[] = [
      { codigo: "D-1", ref: "DREF-1", tipos: "1" },
    ];

    const res = await enqueueTransferJobs({
      properties,
      demands,
      target: targetWithoutInmovilla,
    });

    expect(res).toEqual({
      propertyJobsEnqueued: 0,
      demandJobsEnqueued: 0,
      skipped: [],
    });
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(mockFindManySnapshots).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/no tiene inmovillaAgentId/),
    );

    warnSpy.mockRestore();
  });
});

describe("enqueueTransferJobs — propiedades", () => {
  it("encola TRANSFER_PROPERTY_AGENT por cada propiedad con ref válido", async () => {
    const properties: TransferProperty[] = [
      { codigo: "P-A", ref: "REF-A" },
      { codigo: "P-B", ref: "REF-B" },
    ];

    const res = await enqueueTransferJobs({
      properties,
      demands: [],
      target: targetWithInmovilla,
    });

    expect(res.propertyJobsEnqueued).toBe(2);
    expect(res.demandJobsEnqueued).toBe(0);
    expect(res.skipped).toEqual([]);
    expect(mockEnqueue).toHaveBeenCalledTimes(2);

    expect(mockEnqueue).toHaveBeenNthCalledWith(1, {
      type: "TRANSFER_PROPERTY_AGENT",
      payload: {
        propertyRef: "REF-A",
        newKeyagente: 4242,
        comercialTransferId: "com-target-1",
      },
      idempotencyKey: "transfer-property:P-A:com-target-1",
    });
    expect(mockEnqueue).toHaveBeenNthCalledWith(2, {
      type: "TRANSFER_PROPERTY_AGENT",
      payload: {
        propertyRef: "REF-B",
        newKeyagente: 4242,
        comercialTransferId: "com-target-1",
      },
      idempotencyKey: "transfer-property:P-B:com-target-1",
    });
  });

  it("omite propiedades sin ref y las añade a skipped[]", async () => {
    const properties: TransferProperty[] = [
      { codigo: "P-OK", ref: "REF-OK" },
      { codigo: "P-EMPTY", ref: "" },
      { codigo: "P-WS", ref: "   " },
    ];

    const res = await enqueueTransferJobs({
      properties,
      demands: [],
      target: targetWithInmovilla,
    });

    expect(res.propertyJobsEnqueued).toBe(1);
    expect(res.skipped).toEqual([
      "property:P-EMPTY (sin ref)",
      "property:P-WS (sin ref)",
    ]);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
  });

  it("trata Unique constraint (P2002) como idempotencia exitosa", async () => {
    mockEnqueue
      .mockRejectedValueOnce(new Error("Unique constraint failed on idempotencyKey (P2002)"))
      .mockResolvedValueOnce({} as never);

    const properties: TransferProperty[] = [
      { codigo: "P-A", ref: "REF-A" },
      { codigo: "P-B", ref: "REF-B" },
    ];

    const res = await enqueueTransferJobs({
      properties,
      demands: [],
      target: targetWithInmovilla,
    });

    expect(res.propertyJobsEnqueued).toBe(2);
    expect(res.skipped).toEqual([]);
  });

  it("propaga errores que no son de unicidad", async () => {
    mockEnqueue.mockRejectedValueOnce(new Error("DB connection lost"));

    await expect(
      enqueueTransferJobs({
        properties: [{ codigo: "P-A", ref: "REF-A" }],
        demands: [],
        target: targetWithInmovilla,
      }),
    ).rejects.toThrow(/DB connection lost/);
  });
});

describe("enqueueTransferJobs — demandas", () => {
  it("encola WRITE_TO_INMOVILLA/updateDemandAgent cuando snapshot tiene keycli", async () => {
    mockFindManySnapshots.mockResolvedValue([
      { codigo: "D-1", raw: { keycli: "55555" } },
      { codigo: "D-2", raw: { keycli: "66666" } },
    ] as never);

    const demands: TransferDemand[] = [
      { codigo: "D-1", ref: "DREF-1", tipos: "1,2" },
      { codigo: "D-2", ref: "DREF-2", tipos: "3" },
    ];

    const res = await enqueueTransferJobs({
      properties: [],
      demands,
      target: targetWithInmovilla,
    });

    expect(res.demandJobsEnqueued).toBe(2);
    expect(res.skipped).toEqual([]);
    expect(mockFindManySnapshots).toHaveBeenCalledWith({
      where: { codigo: { in: ["D-1", "D-2"] } },
      select: { codigo: true, raw: true },
    });

    expect(mockEnqueue).toHaveBeenNthCalledWith(1, {
      type: "WRITE_TO_INMOVILLA",
      payload: {
        operation: "updateDemandAgent",
        args: {
          demandId: "D-1",
          demandRef: "DREF-1",
          clientId: "55555",
          agentId: "4242",
          newAgentId: "4242",
          propertyTypes: "1,2",
        },
      },
      idempotencyKey: "transfer-demand:D-1:com-target-1",
    });
  });

  it("omite demandas cuyo snapshot no existe o no tiene keycli", async () => {
    mockFindManySnapshots.mockResolvedValue([
      { codigo: "D-OK", raw: { keycli: "77777" } },
      { codigo: "D-EMPTYKEY", raw: { keycli: "" } },
      { codigo: "D-NULLKEY", raw: { keycli: null } },
    ] as never);

    const demands: TransferDemand[] = [
      { codigo: "D-OK", ref: "DREF-OK", tipos: "1" },
      { codigo: "D-EMPTYKEY", ref: "DREF-E", tipos: "1" },
      { codigo: "D-NULLKEY", ref: "DREF-N", tipos: "1" },
      { codigo: "D-MISSING", ref: "DREF-M", tipos: "1" },
    ];

    const res = await enqueueTransferJobs({
      properties: [],
      demands,
      target: targetWithInmovilla,
    });

    expect(res.demandJobsEnqueued).toBe(1);
    expect(res.skipped).toEqual([
      "demand:D-EMPTYKEY (sin keycli en snapshot)",
      "demand:D-NULLKEY (sin keycli en snapshot)",
      "demand:D-MISSING (sin keycli en snapshot)",
    ]);
  });

  it("omite demandas con keycli válido pero ref vacío", async () => {
    mockFindManySnapshots.mockResolvedValue([
      { codigo: "D-OK", raw: { keycli: "111" } },
      { codigo: "D-NOREF", raw: { keycli: "222" } },
    ] as never);

    const demands: TransferDemand[] = [
      { codigo: "D-OK", ref: "DREF-OK", tipos: "1" },
      { codigo: "D-NOREF", ref: "", tipos: "1" },
    ];

    const res = await enqueueTransferJobs({
      properties: [],
      demands,
      target: targetWithInmovilla,
    });

    expect(res.demandJobsEnqueued).toBe(1);
    expect(res.skipped).toContain("demand:D-NOREF (sin ref)");
  });

  it("no consulta snapshots cuando no hay demandas", async () => {
    await enqueueTransferJobs({
      properties: [{ codigo: "P-A", ref: "REF-A" }],
      demands: [],
      target: targetWithInmovilla,
    });

    expect(mockFindManySnapshots).not.toHaveBeenCalled();
  });

  it("propaga errores no-P2002 al encolar demandas", async () => {
    mockFindManySnapshots.mockResolvedValue([
      { codigo: "D-A", raw: { keycli: "111" } },
    ] as never);
    mockEnqueue.mockRejectedValueOnce(new Error("Timeout"));

    await expect(
      enqueueTransferJobs({
        properties: [],
        demands: [{ codigo: "D-A", ref: "DREF-A", tipos: "1" }],
        target: targetWithInmovilla,
      }),
    ).rejects.toThrow(/Timeout/);
  });
});

describe("enqueueTransferJobs — idempotencia y resumen mixto", () => {
  it("genera idempotencyKey única por (codigo, target.id) para propiedades y demandas", async () => {
    mockFindManySnapshots.mockResolvedValue([
      { codigo: "D-1", raw: { keycli: "111" } },
    ] as never);

    await enqueueTransferJobs({
      properties: [{ codigo: "P-1", ref: "REF-1" }],
      demands: [{ codigo: "D-1", ref: "DREF-1", tipos: "1" }],
      target: targetWithInmovilla,
    });

    const keys = mockEnqueue.mock.calls.map((c) => c[0].idempotencyKey);
    expect(keys).toEqual([
      "transfer-property:P-1:com-target-1",
      "transfer-demand:D-1:com-target-1",
    ]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("retorna contadores correctos con mezcla de éxitos, skips e idempotencia", async () => {
    mockFindManySnapshots.mockResolvedValue([
      { codigo: "D-1", raw: { keycli: "111" } },
    ] as never);
    mockEnqueue
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(new Error("Unique constraint P2002"))
      .mockResolvedValueOnce({} as never);

    const res = await enqueueTransferJobs({
      properties: [
        { codigo: "P-1", ref: "REF-1" },
        { codigo: "P-2", ref: "REF-2" },
        { codigo: "P-NOREF", ref: "" },
      ],
      demands: [{ codigo: "D-1", ref: "DREF-1", tipos: "1" }],
      target: targetWithInmovilla,
    });

    expect(res).toEqual({
      propertyJobsEnqueued: 2,
      demandJobsEnqueued: 1,
      skipped: ["property:P-NOREF (sin ref)"],
    });
  });
});
