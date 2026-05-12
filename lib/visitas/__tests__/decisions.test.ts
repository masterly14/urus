import { beforeEach, describe, expect, it, vi } from "vitest";
import { VisitWorkItemStatus } from "@prisma/client";
import { decideVisitWorkItem } from "../decisions";

const mockVisitFindUnique = vi.fn();
const mockVisitUpdate = vi.fn();
const mockOperacionFindFirst = vi.fn();
const mockOperacionCreate = vi.fn();
const mockOperacionUpdate = vi.fn();
const mockDemandUpdate = vi.fn();
const mockDemandUpdateMany = vi.fn();
const mockDemandSnapshotFindUnique = vi.fn();
const mockAppendEvent = vi.fn();
const mockEnqueueJob = vi.fn();
const mockQueryRaw = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    visitWorkItem: {
      findUnique: (...args: unknown[]) => mockVisitFindUnique(...args),
      update: (...args: unknown[]) => mockVisitUpdate(...args),
    },
    operacion: {
      findFirst: (...args: unknown[]) => mockOperacionFindFirst(...args),
      create: (...args: unknown[]) => mockOperacionCreate(...args),
      update: (...args: unknown[]) => mockOperacionUpdate(...args),
    },
    demandCurrent: {
      update: (...args: unknown[]) => mockDemandUpdate(...args),
      updateMany: (...args: unknown[]) => mockDemandUpdateMany(...args),
    },
    demandSnapshot: {
      findUnique: (...args: unknown[]) => mockDemandSnapshotFindUnique(...args),
    },
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
  },
}));

vi.mock("@/lib/event-store", () => ({
  appendEvent: (...args: unknown[]) => mockAppendEvent(...args),
}));

vi.mock("@/lib/job-queue", () => ({
  enqueueJob: (...args: unknown[]) => mockEnqueueJob(...args),
}));

function makeWorkItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "vwi-001",
    demandId: "DEM-001",
    selectionId: "sel-001",
    propertyId: "PROP-001",
    propertySource: "external",
    comercialId: "com-001",
    buyerName: "Comprador Test",
    buyerPhone: "34600111222",
    propertySnapshot: { title: "Piso Test", city: "Cordoba" },
    contactSnapshot: {},
    nluSummary: "Busca centro",
    status: VisitWorkItemStatus.SCHEDULED,
    scheduledSessionId: "visit-session-1",
    missingContactPhone: false,
    createdAt: new Date("2026-04-30T10:00:00Z"),
    updatedAt: new Date("2026-04-30T10:00:00Z"),
    ...overrides,
  };
}

describe("decideVisitWorkItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVisitFindUnique.mockResolvedValue(makeWorkItem());
    mockVisitUpdate.mockImplementation(({ data }) => Promise.resolve(makeWorkItem(data)));
    mockAppendEvent
      .mockResolvedValueOnce({ id: "evt-decision" })
      .mockResolvedValueOnce({ id: "evt-branch" })
      .mockResolvedValue({ id: "evt-deactivate" });
    mockEnqueueJob.mockResolvedValue({ id: "job-1" });
    mockQueryRaw.mockResolvedValue([{ lastValue: 7 }]);
    mockOperacionFindFirst.mockResolvedValue(null);
    mockOperacionCreate.mockResolvedValue({ id: "op-1", codigo: "OP-2026-0007" });
    mockOperacionUpdate.mockResolvedValue({ id: "op-existing", codigo: "OP-2026-0005" });
    mockDemandUpdate.mockResolvedValue({});
    mockDemandUpdateMany.mockResolvedValue({ count: 1 });
    mockDemandSnapshotFindUnique.mockResolvedValue(null);
  });

  it("verde crea operación y pasa la demanda a EN_NEGOCIACION", async () => {
    const result = await decideVisitWorkItem({
      visitWorkItemId: "vwi-001",
      decision: "green",
      decidedBy: "Comercial",
    });

    expect(mockVisitUpdate).toHaveBeenCalledWith({
      where: { id: "vwi-001" },
      data: { status: VisitWorkItemStatus.DECIDED_GREEN },
    });
    expect(mockOperacionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        codigo: "OP-2026-0007",
        propertyCode: "PROP-001",
        demandId: "DEM-001",
        estado: "EN_CURSO",
      }),
      select: { id: true, codigo: true },
    });
    expect(mockDemandUpdateMany).toHaveBeenCalledWith({
      where: { codigo: "DEM-001" },
      data: { leadStatus: "EN_NEGOCIACION" },
    });
    expect(result.operacion).toMatchObject({ codigo: "OP-2026-0007", existing: false });
  });

  it("verde reutiliza una operación activa solo si pertenece a la misma demanda", async () => {
    mockOperacionFindFirst.mockResolvedValue({
      id: "op-existing",
      codigo: "OP-2026-0005",
      demandId: "DEM-001",
      estado: "EN_CURSO",
    });

    const result = await decideVisitWorkItem({
      visitWorkItemId: "vwi-001",
      decision: "green",
      decidedBy: "Comercial",
    });

    expect(mockOperacionCreate).not.toHaveBeenCalled();
    expect(mockDemandUpdate).not.toHaveBeenCalled();
    expect(mockDemandUpdateMany).toHaveBeenCalledWith({
      where: { codigo: "DEM-001" },
      data: { leadStatus: "EN_NEGOCIACION" },
    });
    expect(result.operacion).toMatchObject({
      id: "op-existing",
      codigo: "OP-2026-0005",
      existing: true,
    });
  });

  it("verde vincula la demanda si reutiliza una operación activa sin comprador", async () => {
    mockOperacionFindFirst.mockResolvedValue({
      id: "op-existing",
      codigo: "OP-2026-0005",
      demandId: null,
      estado: "EN_CURSO",
    });

    const result = await decideVisitWorkItem({
      visitWorkItemId: "vwi-001",
      decision: "green",
      decidedBy: "Comercial",
    });

    expect(mockOperacionCreate).not.toHaveBeenCalled();
    expect(mockOperacionUpdate).toHaveBeenCalledWith({
      where: { id: "op-existing" },
      data: { demandId: "DEM-001", comercialId: "com-001" },
      select: { id: true, codigo: true },
    });
    expect(result.operacion).toMatchObject({
      id: "op-existing",
      codigo: "OP-2026-0005",
      existing: true,
    });
  });

  it("verde bloquea reutilizar una operación activa de otra demanda", async () => {
    mockOperacionFindFirst.mockResolvedValue({
      id: "op-other",
      codigo: "OP-2026-0004",
      demandId: "DEM-OTHER",
      estado: "EN_CURSO",
    });

    await expect(decideVisitWorkItem({
      visitWorkItemId: "vwi-001",
      decision: "green",
      decidedBy: "Comercial",
    })).rejects.toThrow("Ya existe una operación activa para esta propiedad");

    expect(mockOperacionCreate).not.toHaveBeenCalled();
    expect(mockDemandUpdateMany).not.toHaveBeenCalled();
  });

  it("amarillo emite re-perfilado y devuelve la demanda a EN_SELECCION", async () => {
    const postVisitContext = "Quiere terraza, más luz y evitar planta baja";
    const result = await decideVisitWorkItem({
      visitWorkItemId: "vwi-001",
      decision: "yellow",
      notes: "Quiere otra zona",
      postVisitContext,
      decidedBy: "Comercial",
    });

    expect(mockVisitUpdate).toHaveBeenCalledWith({
      where: { id: "vwi-001" },
      data: { status: VisitWorkItemStatus.DECIDED_YELLOW },
    });
    expect(mockAppendEvent).toHaveBeenNthCalledWith(2, expect.objectContaining({
      type: "DEMANDA_REPERFILADO_SOLICITADO",
      aggregateId: "DEM-001",
      payload: expect.objectContaining({
        postVisitContext,
        postVisitContextStructured: expect.objectContaining({
          rawText: postVisitContext,
          source: "commercial_post_visit",
        }),
      }),
    }));
    expect(mockDemandUpdateMany).toHaveBeenCalledWith({
      where: { codigo: "DEM-001" },
      data: { leadStatus: "EN_SELECCION" },
    });
    expect(result.branchEventId).toBe("evt-branch");
  });

  it("rojo solicita baja y marca PERDIDO localmente", async () => {
    const result = await decideVisitWorkItem({
      visitWorkItemId: "vwi-001",
      decision: "red",
      reason: "No sigue buscando",
      decidedBy: "Comercial",
    });

    expect(mockVisitUpdate).toHaveBeenCalledWith({
      where: { id: "vwi-001" },
      data: { status: VisitWorkItemStatus.DECIDED_RED },
    });
    expect(mockAppendEvent).toHaveBeenNthCalledWith(2, expect.objectContaining({
      type: "DEMANDA_BAJA_SOLICITADA",
    }));
    expect(mockDemandUpdate).toHaveBeenCalledWith({
      where: { codigo: "DEM-001" },
      data: { leadStatus: "PERDIDO" },
    });
    expect(result.deactivate).toMatchObject({ inmovillaSyncQueued: false });
  });
});
