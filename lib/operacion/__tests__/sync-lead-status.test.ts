import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    operacion: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/projections/update-lead-status", () => ({
  updateDemandLeadStatus: vi.fn(),
}));

import { syncLeadStatusFromOperacion, leadStatusForOperacionEstado } from "../sync-lead-status";
import { prisma } from "@/lib/prisma";
import { updateDemandLeadStatus } from "@/lib/projections/update-lead-status";

const mockFindUnique = vi.mocked(prisma.operacion.findUnique);
const mockUpdateLeadStatus = vi.mocked(updateDemandLeadStatus);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("leadStatusForOperacionEstado", () => {
  it("maps OFERTA_FIRME to EN_NEGOCIACION", () => {
    expect(leadStatusForOperacionEstado("OFERTA_FIRME")).toBe("EN_NEGOCIACION");
  });

  it("maps RESERVA to EN_NEGOCIACION", () => {
    expect(leadStatusForOperacionEstado("RESERVA")).toBe("EN_NEGOCIACION");
  });

  it("maps ARRAS to EN_NEGOCIACION", () => {
    expect(leadStatusForOperacionEstado("ARRAS")).toBe("EN_NEGOCIACION");
  });

  it("maps PENDIENTE_FIRMA to EN_FIRMA", () => {
    expect(leadStatusForOperacionEstado("PENDIENTE_FIRMA")).toBe("EN_FIRMA");
  });

  it("maps all CERRADA_* to CERRADO", () => {
    expect(leadStatusForOperacionEstado("CERRADA_VENTA")).toBe("CERRADO");
    expect(leadStatusForOperacionEstado("CERRADA_ALQUILER")).toBe("CERRADO");
    expect(leadStatusForOperacionEstado("CERRADA_TRASPASO")).toBe("CERRADO");
  });

  it("returns null for EN_CURSO", () => {
    expect(leadStatusForOperacionEstado("EN_CURSO")).toBeNull();
  });

  it("returns null for CANCELADA (no auto-sync)", () => {
    expect(leadStatusForOperacionEstado("CANCELADA")).toBeNull();
  });
});

describe("syncLeadStatusFromOperacion", () => {
  it("updates leadStatus when operacion has demandId", async () => {
    mockFindUnique.mockResolvedValue({ demandId: "DEM-001" } as never);

    await syncLeadStatusFromOperacion("op-1", "ARRAS");

    expect(mockUpdateLeadStatus).toHaveBeenCalledWith("DEM-001", "EN_NEGOCIACION");
  });

  it("does nothing when operacion has no demandId", async () => {
    mockFindUnique.mockResolvedValue({ demandId: null } as never);

    await syncLeadStatusFromOperacion("op-1", "ARRAS");

    expect(mockUpdateLeadStatus).not.toHaveBeenCalled();
  });

  it("does nothing when operacion not found", async () => {
    mockFindUnique.mockResolvedValue(null);

    await syncLeadStatusFromOperacion("op-missing", "ARRAS");

    expect(mockUpdateLeadStatus).not.toHaveBeenCalled();
  });

  it("does nothing for EN_CURSO (no mapping)", async () => {
    await syncLeadStatusFromOperacion("op-1", "EN_CURSO");

    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockUpdateLeadStatus).not.toHaveBeenCalled();
  });

  it("does nothing for CANCELADA (no auto-sync)", async () => {
    await syncLeadStatusFromOperacion("op-1", "CANCELADA");

    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockUpdateLeadStatus).not.toHaveBeenCalled();
  });

  it("syncs CERRADA_VENTA → CERRADO", async () => {
    mockFindUnique.mockResolvedValue({ demandId: "DEM-002" } as never);

    await syncLeadStatusFromOperacion("op-2", "CERRADA_VENTA");

    expect(mockUpdateLeadStatus).toHaveBeenCalledWith("DEM-002", "CERRADO");
  });
});
