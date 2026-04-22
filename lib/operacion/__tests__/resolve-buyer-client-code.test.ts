import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    demandSnapshot: { findUnique: vi.fn() },
  },
}));

import { resolveBuyerClientCode } from "../resolve-buyer-client-code";
import { prisma } from "@/lib/prisma";

const mockSnapshotFind = vi.mocked(prisma.demandSnapshot.findUnique);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveBuyerClientCode", () => {
  it("returns buyerClientId directly when it is numeric", async () => {
    const result = await resolveBuyerClientCode("12345", null);
    expect(result).toBe("12345");
    expect(mockSnapshotFind).not.toHaveBeenCalled();
  });

  it("ignores buyerClientId if not numeric (e.g. cuid)", async () => {
    mockSnapshotFind.mockResolvedValue(null);
    const result = await resolveBuyerClientCode("clxyz_not_a_number", "DEM-001");
    expect(result).toBeNull();
    expect(mockSnapshotFind).toHaveBeenCalledOnce();
  });

  it("resolves cod_cli from DemandSnapshot.raw via keycli", async () => {
    mockSnapshotFind.mockResolvedValue({
      raw: { keycli: 98765, keyagente: "100" },
    } as never);

    const result = await resolveBuyerClientCode(null, "DEM-002");
    expect(result).toBe("98765");
  });

  it("resolves cod_cli from DemandSnapshot.raw via cod_cli string", async () => {
    mockSnapshotFind.mockResolvedValue({
      raw: { cod_cli: "55555" },
    } as never);

    const result = await resolveBuyerClientCode(null, "DEM-003");
    expect(result).toBe("55555");
  });

  it("resolves cod_cli from clientes-cod_clipriclave", async () => {
    mockSnapshotFind.mockResolvedValue({
      raw: { "clientes-cod_clipriclave": 42 },
    } as never);

    const result = await resolveBuyerClientCode(null, "DEM-004");
    expect(result).toBe("42");
  });

  it("returns null when snapshot has no recognizable client code", async () => {
    mockSnapshotFind.mockResolvedValue({
      raw: { nombre: "Juan", email: "juan@test.com" },
    } as never);

    const result = await resolveBuyerClientCode(null, "DEM-005");
    expect(result).toBeNull();
  });

  it("returns null when no snapshot exists", async () => {
    mockSnapshotFind.mockResolvedValue(null);
    const result = await resolveBuyerClientCode(null, "DEM-MISSING");
    expect(result).toBeNull();
  });

  it("returns null when neither buyerClientId nor demandId provided", async () => {
    const result = await resolveBuyerClientCode(null, null);
    expect(result).toBeNull();
    expect(mockSnapshotFind).not.toHaveBeenCalled();
  });

  it("prefers buyerClientId over snapshot when both are available", async () => {
    mockSnapshotFind.mockResolvedValue({
      raw: { keycli: 99999 },
    } as never);

    const result = await resolveBuyerClientCode("11111", "DEM-006");
    expect(result).toBe("11111");
    expect(mockSnapshotFind).not.toHaveBeenCalled();
  });

  it("ignores zero values in snapshot raw", async () => {
    mockSnapshotFind.mockResolvedValue({
      raw: { keycli: 0, cod_cli: "0" },
    } as never);

    const result = await resolveBuyerClientCode(null, "DEM-007");
    expect(result).toBeNull();
  });

  it("handles empty raw object", async () => {
    mockSnapshotFind.mockResolvedValue({
      raw: {},
    } as never);

    const result = await resolveBuyerClientCode(null, "DEM-008");
    expect(result).toBeNull();
  });
});
