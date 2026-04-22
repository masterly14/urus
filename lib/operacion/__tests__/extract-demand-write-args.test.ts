import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    demandSnapshot: { findUnique: vi.fn() },
  },
}));

import { extractDemandWriteArgs } from "../extract-demand-write-args";
import { prisma } from "@/lib/prisma";

const mockSnapshotFind = vi.mocked(prisma.demandSnapshot.findUnique);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("extractDemandWriteArgs", () => {
  it("extracts all fields from a complete snapshot", async () => {
    mockSnapshotFind.mockResolvedValue({
      ref: "REF-100",
      raw: {
        keycli: "12345",
        keyagente: "AG-01",
        tipopropiedad: "Piso",
      },
    } as never);

    const result = await extractDemandWriteArgs("DEM-001");
    expect(result).toEqual({
      demandId: "DEM-001",
      demandRef: "REF-100",
      clientId: "12345",
      agentId: "AG-01",
      propertyTypes: "Piso",
    });
  });

  it("uses demandId as fallback demandRef when ref is empty", async () => {
    mockSnapshotFind.mockResolvedValue({
      ref: "",
      raw: {
        keycli: 99,
        keyagente: 10,
      },
    } as never);

    const result = await extractDemandWriteArgs("DEM-002");
    expect(result).not.toBeNull();
    expect(result!.demandRef).toBe("DEM-002");
  });

  it("returns null when snapshot does not exist", async () => {
    mockSnapshotFind.mockResolvedValue(null);
    const result = await extractDemandWriteArgs("DEM-MISSING");
    expect(result).toBeNull();
  });

  it("returns null when clientId is missing", async () => {
    mockSnapshotFind.mockResolvedValue({
      ref: "REF-200",
      raw: { keyagente: "AG-02" },
    } as never);

    const result = await extractDemandWriteArgs("DEM-003");
    expect(result).toBeNull();
  });

  it("returns null when agentId is missing", async () => {
    mockSnapshotFind.mockResolvedValue({
      ref: "REF-300",
      raw: { keycli: "111" },
    } as never);

    const result = await extractDemandWriteArgs("DEM-004");
    expect(result).toBeNull();
  });

  it("resolves clientId from alternative keys", async () => {
    mockSnapshotFind.mockResolvedValue({
      ref: "REF-400",
      raw: {
        "clientes-cod_clipriclave": 54321,
        "demandas-keyagente": "AG-03",
        tipos: "Casa, Chalet",
      },
    } as never);

    const result = await extractDemandWriteArgs("DEM-005");
    expect(result).toEqual({
      demandId: "DEM-005",
      demandRef: "REF-400",
      clientId: "54321",
      agentId: "AG-03",
      propertyTypes: "Casa, Chalet",
    });
  });

  it("defaults propertyTypes to empty string when not found", async () => {
    mockSnapshotFind.mockResolvedValue({
      ref: "REF-500",
      raw: { keycli: "1", keyagente: "2" },
    } as never);

    const result = await extractDemandWriteArgs("DEM-006");
    expect(result).not.toBeNull();
    expect(result!.propertyTypes).toBe("");
  });

  it("ignores zero values for clientId and agentId", async () => {
    mockSnapshotFind.mockResolvedValue({
      ref: "REF-600",
      raw: { keycli: 0, keyagente: 0 },
    } as never);

    const result = await extractDemandWriteArgs("DEM-007");
    expect(result).toBeNull();
  });
});
