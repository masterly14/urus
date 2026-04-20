/**
 * Tests unitarios para dedup de selecciones de coverage.
 *
 * Mockea Prisma para validar la lógica de cooldown y dedup.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const findFirstMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    micrositeSelection: {
      findFirst: (...args: unknown[]) => findFirstMock(...args),
    },
  },
}));

import { hasRecentCoverageSelection } from "../coverage-dedup";

describe("hasRecentCoverageSelection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna true si existe una selección PENDING_VALIDATION con source=coverage_scan", async () => {
    findFirstMock.mockResolvedValueOnce({ id: "sel-1" });

    const result = await hasRecentCoverageSelection("DEM-001");
    expect(result).toBe(true);

    expect(findFirstMock).toHaveBeenCalledTimes(1);
    expect(findFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          demandId: "DEM-001",
          source: "coverage_scan",
          status: "PENDING_VALIDATION",
        }),
      }),
    );
  });

  it("retorna true si existe una selección APPROVED reciente con source=coverage_scan", async () => {
    findFirstMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "sel-2" });

    const result = await hasRecentCoverageSelection("DEM-001");
    expect(result).toBe(true);
    expect(findFirstMock).toHaveBeenCalledTimes(2);
  });

  it("retorna false si no hay selección ni pendiente ni aprobada reciente", async () => {
    findFirstMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const result = await hasRecentCoverageSelection("DEM-001");
    expect(result).toBe(false);
    expect(findFirstMock).toHaveBeenCalledTimes(2);
  });

  it("no busca APPROVED si ya encontró PENDING_VALIDATION", async () => {
    findFirstMock.mockResolvedValueOnce({ id: "sel-1" });

    const result = await hasRecentCoverageSelection("DEM-001");
    expect(result).toBe(true);
    expect(findFirstMock).toHaveBeenCalledTimes(1);
  });
});
