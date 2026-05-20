import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    manualSyncTask: {
      createMany: (...args: unknown[]) => mockCreateMany(...args),
    },
  },
}));

import { createManualSyncTasks } from "@/lib/comercial/create-manual-sync-tasks";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createManualSyncTasks", () => {
  it("crea tareas por propiedad y demanda y retorna resumen", async () => {
    mockCreateMany
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 1 });

    const result = await createManualSyncTasks({
      properties: [
        { codigo: "P-1", ref: "REF-1" },
        { codigo: "P-2", ref: "REF-2" },
      ],
      demands: [{ codigo: "D-1", ref: "DREF-1" }],
      target: {
        id: "com-target",
        nombre: "Comercial Destino",
        inmovillaAgentId: 177892,
      },
      createdByUserId: "ceo-1",
      sourceUserId: "user-deleted-1",
    });

    expect(result).toEqual({ total: 3, properties: 2, demands: 1 });
    expect(mockCreateMany).toHaveBeenCalledTimes(2);
    expect(mockCreateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        skipDuplicates: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            type: "PROPERTY",
            recordCode: "P-1",
            targetComercialId: "com-target",
            sourceUserId: "user-deleted-1",
          }),
        ]),
      }),
    );
    expect(mockCreateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        skipDuplicates: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            type: "DEMAND",
            recordCode: "D-1",
          }),
        ]),
      }),
    );
  });

  it("omite códigos vacíos y no llama createMany cuando no hay filas", async () => {
    const result = await createManualSyncTasks({
      properties: [{ codigo: "   ", ref: "REF-X" }],
      demands: [],
      target: {
        id: "com-target",
        nombre: "Comercial Destino",
        inmovillaAgentId: null,
      },
      createdByUserId: "ceo-1",
      sourceUserId: "user-deleted-1",
    });

    expect(result).toEqual({ total: 0, properties: 0, demands: 0 });
    expect(mockCreateMany).not.toHaveBeenCalled();
  });
});
